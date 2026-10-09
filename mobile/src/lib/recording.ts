import { AudioContext, type AudioBuffer, type AudioBufferSourceNode } from 'react-native-audio-api';
import { callRecording } from '@shared/client/api';
import type { Connection } from './api';
import { routeAudioForListening } from './audioSession';

/**
 * Plays a call's recording: from any point (tap a transcript line), with the position for
 * highlighting the line being heard.
 */
export interface RecordingPlayer {
  durationMs: number;
  play: (fromMs?: number) => void;
  pause: () => void;
  /** Where playback is (ms). */
  positionMs: () => number;
  playing: () => boolean;
  close: () => void;
}

export async function loadRecording(conn: Connection, callId: string, onEnded: () => void): Promise<RecordingPlayer> {
  const bytes = await callRecording(conn, callId);
  await routeAudioForListening();
  const ctx = new AudioContext();
  // decodeAudioData converts to the device's rate (unlike a raw buffer; see lib/listen).
  const buffer: AudioBuffer = await ctx.decodeAudioData(bytes);
  const durationMs = buffer.duration * 1000;
  let src: AudioBufferSourceNode | null = null;
  /** ctx time when playback started, and the recording time it started from. */
  let started = 0;
  let from = 0;
  let pausedAt = 0;

  const stop = () => {
    const s = src;
    src = null;
    if (!s) return;
    s.onEnded = null;
    try {
      s.stop();
    } catch {}
  };
  const positionMs = () => (src ? Math.min(durationMs, from + (ctx.currentTime - started) * 1000) : pausedAt);

  return {
    durationMs,
    positionMs,
    playing: () => src !== null,
    play: (fromMs) => {
      const at = Math.max(0, Math.min(fromMs ?? pausedAt, durationMs - 50));
      stop();
      void ctx.resume();
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(ctx.destination);
      s.onEnded = () => {
        if (src !== s) return;
        src = null;
        pausedAt = 0;
        onEnded();
      };
      started = ctx.currentTime;
      from = at;
      src = s;
      s.start(0, at / 1000);
    },
    pause: () => {
      pausedAt = positionMs();
      stop();
    },
    close: () => {
      stop();
      void ctx.close().catch(() => {});
    },
  };
}
