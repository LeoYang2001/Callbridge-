import { AudioContext, type AudioBufferSourceNode } from 'react-native-audio-api';
import { voiceSample } from '@shared/client/api';
import type { Connection } from './api';
import { routeAudioForListening } from './audioSession';

/**
 * Plays a short sample of an assistant voice (picking one on Me). Only the latest request plays:
 * a new one, or stopVoiceSample, stops the sample playing and drops any still loading. Samples
 * are kept for the session once downloaded.
 */

export type SampleState = 'loading' | 'playing' | 'done';

const downloaded = new Map<string, Promise<ArrayBuffer>>();
let playing: { ctx: AudioContext; src: AudioBufferSourceNode } | null = null;
/** Bumped by every request and stop; a request still loading when it changes is dropped. */
let latest = 0;

function stopPlaying() {
  if (!playing) return;
  const { ctx, src } = playing;
  playing = null;
  try {
    src.stop();
  } catch {}
  void ctx.close().catch(() => {});
}

export function stopVoiceSample() {
  latest++;
  stopPlaying();
}

/** onState hears this request's progress only (nothing once a newer request replaces it). */
export async function playVoiceSample(conn: Connection, voice: string, language: string, onState?: (state: SampleState) => void): Promise<void> {
  const me = ++latest;
  const current = () => me === latest;
  stopPlaying();
  onState?.('loading');
  const key = `${voice}|${language}`;
  let audio = downloaded.get(key);
  if (!audio) {
    audio = voiceSample(conn, voice, language);
    downloaded.set(key, audio);
    audio.catch(() => downloaded.delete(key));
  }
  let ctx: AudioContext | null = null;
  try {
    const bytes = await audio;
    if (!current()) return;
    await routeAudioForListening();
    if (!current()) return;
    ctx = new AudioContext();
    await ctx.resume();
    // decodeAudioData converts to the device's rate (unlike a raw buffer; see lib/listen).
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    if (!current()) {
      void ctx.close().catch(() => {});
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const mine = { ctx, src };
    src.onEnded = () => {
      if (playing !== mine) return;
      stopPlaying();
      if (current()) onState?.('done');
    };
    playing = mine;
    src.start();
    onState?.('playing');
  } catch (e) {
    if (ctx && playing?.ctx !== ctx) void ctx.close().catch(() => {});
    if (current()) {
      onState?.('done');
      throw e;
    }
  }
}
