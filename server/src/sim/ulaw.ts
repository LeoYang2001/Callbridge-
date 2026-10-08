/** G.711 μ-law helpers for the call simulator: decoding and writing a listenable WAV. */

const BIAS = 0x84;

/** One μ-law byte → 16-bit linear PCM sample. */
export function ulawToLinear(u: number): number {
  const v = ~u & 0xff;
  const sign = v & 0x80;
  const exponent = (v >> 4) & 0x07;
  const mantissa = v & 0x0f;
  const sample = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -sample : sample;
}

/** μ-law silence (decodes to 0). */
export const ULAW_SILENCE = 0xff;

/**
 * Stereo 16-bit PCM WAV at 8 kHz: left = the caller (CallBridge's assistant), right = the
 * simulated business. Both inputs are μ-law, one byte per sample, and must be the same length.
 */
export function stereoWav(left: Buffer, right: Buffer, sampleRate = 8000): Buffer {
  const frames = Math.min(left.length, right.length);
  const dataBytes = frames * 4;
  const out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); // fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(2, 22); // channels
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 4, 28); // byte rate
  out.writeUInt16LE(4, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write('data', 36);
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) {
    out.writeInt16LE(ulawToLinear(left[i]!), 44 + i * 4);
    out.writeInt16LE(ulawToLinear(right[i]!), 46 + i * 4);
  }
  return out;
}
