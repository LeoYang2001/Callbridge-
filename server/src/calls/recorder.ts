import { ulawToFloat } from '../../../shared/client/listen';

/**
 * A recording of a call as it was heard on the line: the other party at the moment their audio
 * arrived, the assistant at the moment it played (its audio is sent faster than real time and
 * queues on the line), and nothing of what it never got to say when it was interrupted. Both
 * are mixed into one 8 kHz track. Times are on the media stream's clock (ms since it started),
 * so transcript lines can be placed on it exactly.
 */

const RATE = 8000;
const PER_MS = RATE / 1000;

/** μ-law byte → 16-bit sample, precomputed. */
const ULAW = Int16Array.from({ length: 256 }, (_, b) => Math.round(ulawToFloat(b) * 32767));

class Track {
  samples = new Int16Array(RATE * 60);
  end = 0;

  write(at: number, bytes: Buffer) {
    const need = at + bytes.length;
    if (need > this.samples.length) {
      const grown = new Int16Array(Math.max(need, this.samples.length * 2));
      grown.set(this.samples);
      this.samples = grown;
    }
    for (let i = 0; i < bytes.length; i++) this.samples[at + i] = ULAW[bytes[i]!]!;
    this.end = Math.max(this.end, need);
  }

  /** Silences everything from `at` on. */
  cut(at: number) {
    if (at < this.end) this.samples.fill(0, at, this.end);
    this.end = Math.min(this.end, at);
  }
}

export class CallRecorder {
  private readonly theirs = new Track();
  private readonly ours = new Track();
  /** Where the assistant's next chunk plays: right after the last, or now if the line went quiet. */
  private aiCursor = 0;

  constructor(private readonly maxMs: number) {}

  /** The other party's audio, at its media timestamp. */
  them(payloadB64: string, ts: number) {
    const at = Math.round(ts * PER_MS);
    if (at > this.maxMs * PER_MS) return;
    this.theirs.write(at, Buffer.from(payloadB64, 'base64'));
  }

  /** The assistant's audio, sent now (media time); returns where on the recording it plays (ms). */
  ai(payloadB64: string, nowTs: number): number {
    const bytes = Buffer.from(payloadB64, 'base64');
    const at = Math.max(this.aiCursor, Math.round(nowTs * PER_MS));
    if (at <= this.maxMs * PER_MS) this.ours.write(at, bytes);
    this.aiCursor = at + bytes.length;
    return at / PER_MS;
  }

  /** The assistant's queued audio was dropped (interrupted at `nowTs`): it was never heard. */
  cut(nowTs: number) {
    const at = Math.round(nowTs * PER_MS);
    this.ours.cut(at);
    this.aiCursor = at;
  }

  get durationMs(): number {
    return Math.max(this.theirs.end, this.ours.end) / PER_MS;
  }

  /** Both sides mixed, as a 16-bit mono WAV file. */
  wav(): Buffer {
    const n = Math.max(this.theirs.end, this.ours.end);
    const out = Buffer.alloc(44 + n * 2);
    out.write('RIFF', 0);
    out.writeUInt32LE(36 + n * 2, 4);
    out.write('WAVE', 8);
    out.write('fmt ', 12);
    out.writeUInt32LE(16, 16);
    out.writeUInt16LE(1, 20); // PCM
    out.writeUInt16LE(1, 22); // mono
    out.writeUInt32LE(RATE, 24);
    out.writeUInt32LE(RATE * 2, 28);
    out.writeUInt16LE(2, 32);
    out.writeUInt16LE(16, 34);
    out.write('data', 36);
    out.writeUInt32LE(n * 2, 40);
    const a = this.theirs.samples;
    const b = this.ours.samples;
    for (let i = 0; i < n; i++) {
      const v = (i < a.length ? a[i]! : 0) + (i < b.length ? b[i]! : 0);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), 44 + i * 2);
    }
    return out;
  }
}
