import { describe, expect, it } from 'vitest';
import { CallRecorder } from '../src/calls/recorder';

// 20 ms of μ-law at 8 kHz; 0x00 is a loud sample, 0xff is silence.
const loud = Buffer.alloc(160, 0x00).toString('base64');

describe('call recorder', () => {
  it('places the assistant where it played: queued after itself, and cut where interrupted', () => {
    const rec = new CallRecorder(60_000);
    rec.them(loud, 0);
    rec.them(loud, 20);
    // The model sends three chunks at once, at 40 ms: they play back to back from 40 ms.
    expect([rec.ai(loud, 40), rec.ai(loud, 40), rec.ai(loud, 40)]).toEqual([40, 60, 80]);
    expect(rec.durationMs).toBe(100);
    // Interrupted at 70 ms: the rest was never heard, and the next line starts from now.
    rec.cut(70);
    expect(rec.durationMs).toBe(70);
    expect(rec.ai(loud, 70)).toBe(70);
  });

  it('writes a 16-bit mono 8 kHz WAV of both sides mixed', () => {
    const rec = new CallRecorder(60_000);
    rec.them(loud, 0);
    rec.ai(loud, 0);
    const wav = rec.wav();
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt32LE(40)).toBe(160 * 2);
    // Two loud samples summed clip rather than wrap around.
    expect(Math.abs(wav.readInt16LE(44))).toBe(32767 + (wav.readInt16LE(44) < 0 ? 1 : 0));
  });
});
