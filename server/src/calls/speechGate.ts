/**
 * A real-time check on the other side's phone audio: is someone actually talking right now?
 *
 * OpenAI's turn detection says when speech starts and ends, but on a phone line it also fires on
 * background noise and on short acknowledgments ("okay", "mm-hm"), and its end-of-turn signal can
 * lag by seconds. This gate measures voiced audio in the 20 ms frames we already relay, against
 * an adaptive noise floor, so the call session can tell a real interruption (sustained speech)
 * from a blip.
 */

/** G.711 μ-law byte → 16-bit linear PCM sample. */
export function ulawToLinear(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return sign ? -magnitude : magnitude;
}

/** Speech must be this much louder than the background noise. */
const FLOOR_RATIO = 3;
/** And at least this loud (PCM16 RMS), so a dead-quiet line doesn't count hiss as speech. */
const MIN_SPEECH_RMS = 400;
const KEEP_MS = 4000;
/**
 * The noise floor is a low percentile of recent frame levels: speech has gaps between words,
 * steady noise (a fan, traffic, a TV) doesn't, so the floor rises to meet steady noise only.
 */
const FLOOR_PERCENTILE = 0.15;
const FLOOR_WINDOW_FRAMES = 200;
/** Until this many frames have been seen, use the default floor. */
const FLOOR_WARMUP_FRAMES = 25;

interface Frame {
  /** Media-clock time at the end of the frame (ms). */
  ts: number;
  ms: number;
  voiced: boolean;
}

export class SpeechGate {
  private floor = 150;
  private frames: Frame[] = [];
  private levels: number[] = [];

  /** Feed one inbound chunk (base64 μ-law) with the media timestamp Twilio gave it. */
  observe(payloadB64: string, ts: number) {
    const bytes = Buffer.from(payloadB64, 'base64');
    if (bytes.length === 0) return;
    let sum = 0;
    for (const b of bytes) {
      const s = ulawToLinear(b);
      sum += s * s;
    }
    const rms = Math.sqrt(sum / bytes.length);
    this.levels.push(rms);
    if (this.levels.length > FLOOR_WINDOW_FRAMES) this.levels.shift();
    if (this.levels.length >= FLOOR_WARMUP_FRAMES) {
      const sorted = [...this.levels].sort((a, b) => a - b);
      this.floor = Math.min(Math.max(sorted[Math.floor(sorted.length * FLOOR_PERCENTILE)]!, 20), 4000);
    }
    const voiced = rms > Math.max(MIN_SPEECH_RMS, this.floor * FLOOR_RATIO);
    this.frames.push({ ts, ms: bytes.length / 8, voiced });
    while (this.frames.length && this.frames[0]!.ts < ts - KEEP_MS) this.frames.shift();
  }

  /** Milliseconds of voiced audio in frames ending after `sinceTs`. */
  voicedMsSince(sinceTs: number): number {
    let total = 0;
    for (let i = this.frames.length - 1; i >= 0 && this.frames[i]!.ts > sinceTs; i--) {
      if (this.frames[i]!.voiced) total += this.frames[i]!.ms;
    }
    return total;
  }

  get noiseFloor() {
    return Math.round(this.floor);
  }
}
