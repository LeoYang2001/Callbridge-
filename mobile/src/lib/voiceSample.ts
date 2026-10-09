import { AudioContext, type AudioBufferSourceNode } from 'react-native-audio-api';
import { voiceSample } from '@shared/client/api';
import type { Connection } from './api';
import { routeAudioForListening } from './audioSession';

/**
 * Plays a short sample of an assistant voice (picking one on Me). A new pick stops the one
 * still playing. Samples are kept for the session once downloaded.
 */

const downloaded = new Map<string, Promise<ArrayBuffer>>();
let playing: { ctx: AudioContext; src: AudioBufferSourceNode } | null = null;

export function stopVoiceSample() {
  if (!playing) return;
  const { ctx, src } = playing;
  playing = null;
  try {
    src.stop();
  } catch {}
  void ctx.close().catch(() => {});
}

export async function playVoiceSample(conn: Connection, voice: string, language: string): Promise<void> {
  stopVoiceSample();
  const key = `${voice}|${language}`;
  let audio = downloaded.get(key);
  if (!audio) {
    audio = voiceSample(conn, voice, language);
    downloaded.set(key, audio);
    audio.catch(() => downloaded.delete(key));
  }
  const bytes = await audio;
  await routeAudioForListening();
  const ctx = new AudioContext();
  await ctx.resume();
  // decodeAudioData converts to the device's rate (unlike a raw buffer; see lib/listen).
  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  const mine = { ctx, src };
  src.onEnded = () => {
    if (playing === mine) stopVoiceSample();
  };
  playing = mine;
  src.start();
}
