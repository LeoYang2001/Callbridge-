/**
 * Phone audio plumbing for the translator: G.711 μ-law (8 kHz, what Twilio streams) to and from
 * 16-bit PCM, resampling to and from the 24 kHz the translation model works in, and mixing
 * translated speech into a caller's line.
 */

const BIAS = 0x84;
const CLIP = 32635;

const ULAW_TABLE = Int16Array.from({ length: 256 }, (_, u) => {
  const v = ~u & 0xff;
  const exponent = (v >> 4) & 0x07;
  const sample = ((((v & 0x0f) << 3) + BIAS) << exponent) - BIAS;
  return v & 0x80 ? -sample : sample;
});

export function ulawDecode(ulaw: Uint8Array): Int16Array {
  const out = new Int16Array(ulaw.length);
  for (let i = 0; i < ulaw.length; i++) out[i] = ULAW_TABLE[ulaw[i]!]!;
  return out;
}

function encodeSample(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function ulawEncode(pcm: ArrayLike<number>): Buffer {
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = encodeSample(pcm[i]!);
  return out;
}

/** 16-bit little-endian PCM bytes ↔ samples. */
export function pcm16FromBytes(bytes: Buffer): Int16Array {
  const out = new Int16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = bytes.readInt16LE(i * 2);
  return out;
}

export function pcm16ToBytes(pcm: Int16Array): Buffer {
  const out = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) out.writeInt16LE(pcm[i]!, i * 2);
  return out;
}

/** 8 kHz → 24 kHz by linear interpolation, continuous across chunks (phone audio has nothing above 4 kHz). */
export class Upsampler {
  private last = 0;

  process(input: Int16Array): Int16Array {
    const out = new Int16Array(input.length * 3);
    for (let i = 0; i < input.length; i++) {
      const x = input[i]!;
      for (let k = 1; k <= 3; k++) out[i * 3 + k - 1] = Math.round(this.last + ((x - this.last) * k) / 3);
      this.last = x;
    }
    return out;
  }
}

/** Low-pass (≈3.4 kHz, below the 4 kHz phone Nyquist) then keep every third sample: 24 kHz → 8 kHz. */
export class Downsampler {
  private static readonly TAPS = makeLowPass(31, 3400 / 24000);
  private readonly history = new Float64Array(Downsampler.TAPS.length);
  private pos = 0;
  private phase = 0;

  process(input: Int16Array): Int16Array {
    const taps = Downsampler.TAPS;
    const n = taps.length;
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      this.history[this.pos] = input[i]!;
      this.pos = (this.pos + 1) % n;
      if (this.phase === 0) {
        let acc = 0;
        for (let t = 0; t < n; t++) acc += taps[t]! * this.history[(this.pos + t) % n]!;
        out.push(Math.max(-32768, Math.min(32767, Math.round(acc))));
      }
      this.phase = (this.phase + 1) % 3;
    }
    return Int16Array.from(out);
  }
}

function makeLowPass(length: number, cutoff: number): Float64Array {
  const taps = new Float64Array(length);
  const mid = (length - 1) / 2;
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const x = i - mid;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (length - 1));
    taps[i] = sinc * hamming;
    sum += taps[i]!;
  }
  for (let i = 0; i < length; i++) taps[i] = taps[i]! / sum;
  return taps;
}

/** Linear resampling for an unexpected output rate (the model normally sends 24 kHz). */
export function resampleLinear(input: Int16Array, from: number, to: number): Int16Array {
  if (from === to || input.length === 0) return input;
  const out = new Int16Array(Math.max(1, Math.round((input.length * to) / from)));
  for (let i = 0; i < out.length; i++) {
    const src = (i * from) / to;
    const a = Math.floor(src);
    const b = Math.min(a + 1, input.length - 1);
    out[i] = Math.round(input[a]! + (input[b]! - input[a]!) * (src - a));
  }
  return out;
}

/** Translated speech waiting to be mixed into a line, in 8 kHz samples. */
export class OverlayQueue {
  private chunks: Int16Array[] = [];
  private offset = 0;
  private queued = 0;

  push(samples: Int16Array) {
    if (samples.length) {
      this.chunks.push(samples);
      this.queued += samples.length;
    }
  }

  /** The next `n` samples (zero-padded at the end), or null when nothing is queued. */
  take(n: number): Int16Array | null {
    if (this.queued === 0) return null;
    const out = new Int16Array(n);
    let filled = 0;
    while (filled < n && this.chunks.length) {
      const chunk = this.chunks[0]!;
      const count = Math.min(n - filled, chunk.length - this.offset);
      out.set(chunk.subarray(this.offset, this.offset + count), filled);
      filled += count;
      this.offset += count;
      if (this.offset >= chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    this.queued -= filled;
    return out;
  }

  get pendingMs() {
    return this.queued / 8;
  }

  clear() {
    this.chunks = [];
    this.offset = 0;
    this.queued = 0;
  }
}

/**
 * One frame for a listener: the other caller's voice, with translated speech on top. While the
 * translation plays, the original voice is turned down so the translation is what they follow.
 */
export function mixFrame(original: Buffer, overlay: Int16Array | null, duck = 0.3): Buffer {
  if (!overlay) return original;
  const voice = ulawDecode(original);
  const out = new Int16Array(voice.length);
  for (let i = 0; i < voice.length; i++) out[i] = Math.max(-32768, Math.min(32767, voice[i]! * duck + (overlay[i] ?? 0)));
  return ulawEncode(out);
}
