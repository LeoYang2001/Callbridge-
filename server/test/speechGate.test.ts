import { describe, expect, it } from 'vitest';
import { SpeechGate, ulawToLinear } from '../src/calls/speechGate';

const frame = (byte: number) => Buffer.alloc(160, byte).toString('base64');
/** μ-law byte for a given linear level (search; the codec is monotonic per sign). */
const ulawFor = (level: number) => {
  let best = 0xff;
  for (let b = 0x80; b <= 0xff; b++) if (Math.abs(ulawToLinear(b) - level) < Math.abs(ulawToLinear(best) - level)) best = b;
  return best;
};

describe('SpeechGate', () => {
  it('decodes μ-law', () => {
    expect(ulawToLinear(0xff)).toBe(0);
    expect(ulawToLinear(0x00)).toBe(-32124);
    expect(ulawToLinear(0x80)).toBe(32124);
  });

  it('counts loud frames as speech and silence as not', () => {
    const g = new SpeechGate();
    let ts = 0;
    for (let i = 0; i < 10; i++) g.observe(frame(0xff), (ts += 20));
    for (let i = 0; i < 25; i++) g.observe(frame(ulawFor(6000)), (ts += 20));
    expect(g.voicedMsSince(ts - 500)).toBe(500);
    expect(g.voicedMsSince(ts - 1000)).toBe(500);
  });

  it('stops counting steady background noise as speech', () => {
    const g = new SpeechGate();
    let ts = 0;
    for (let i = 0; i < 150; i++) g.observe(frame(ulawFor(900)), (ts += 20)); // 3 s of a fan
    expect(g.voicedMsSince(ts - 500)).toBe(0);
    // A voice over the noise still counts.
    for (let i = 0; i < 10; i++) g.observe(frame(ulawFor(8000)), (ts += 20));
    expect(g.voicedMsSince(ts - 200)).toBe(200);
  });
});
