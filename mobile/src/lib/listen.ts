import { AudioContext } from 'react-native-audio-api';
import { startListening as start, type Listener, type ListenOutput } from '@shared/client/listen';
import type { Connection } from './api';
import { routeAudioForListening } from './audioSession';

export type { Listener };

/** Live listening through react-native-audio-api (the Web Audio API, natively). */
export async function startListening(conn: Connection, callId: string, onEnd: (reason: string) => void): Promise<Listener> {
  routeAudioForListening();
  const ctx = new AudioContext();
  await ctx.resume();
  const output: ListenOutput = {
    currentTime: () => ctx.currentTime,
    play: (samples, sampleRate, when) => {
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(when);
      return { duration: buffer.duration, stop: () => src.stop(), onEnded: (fn) => (src.onEnded = fn) };
    },
    close: () => void ctx.close().catch(() => {}),
  };
  return start(conn, callId, output, onEnd);
}
