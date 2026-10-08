import { startListening as start, type Listener, type ListenOutput } from '../../shared/client/listen';
import type { Settings } from './settings';

export type { Listener };

/** Live listening through Web Audio. start() must run from a tap: browsers only allow sound after a user gesture. */
export async function startListening(settings: Settings, callId: string, onEnd: (reason: string) => void): Promise<Listener> {
  const ctx = new AudioContext();
  await ctx.resume();
  const output: ListenOutput = {
    currentTime: () => ctx.currentTime,
    play: (samples, sampleRate, when) => {
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(when);
      return { duration: buffer.duration, stop: () => src.stop(), onEnded: (fn) => (src.onended = fn) };
    },
    close: () => void ctx.close().catch(() => {}),
  };
  return start(settings, callId, output, onEnd);
}
