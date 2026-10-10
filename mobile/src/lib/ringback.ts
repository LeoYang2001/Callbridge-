import { useEffect } from 'react';
import { AudioContext } from 'react-native-audio-api';
import { routeAudioForListening } from './audioSession';

/**
 * The ring you hear while a call is dialing: the North American ringback tone (440 Hz and 480 Hz
 * together, two seconds on, four off), made on the fly so there's no sound file to ship. It
 * plays from the moment the call is placed until it's answered, fails or is cancelled.
 */

const ON_S = 2;
const CYCLE_S = 6;
const VOLUME = 0.12;
/** Fade in and out over this long so the tone doesn't click. */
const EDGE_S = 0.02;

async function startRingback(): Promise<() => void> {
  await routeAudioForListening();
  const ctx = new AudioContext();
  await ctx.resume();
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.round(CYCLE_S * rate), rate);
  const pcm = new Float32Array(buffer.length);
  const on = Math.round(ON_S * rate);
  const edge = Math.round(EDGE_S * rate);
  for (let i = 0; i < on; i++) {
    const t = i / rate;
    const env = Math.min(1, i / edge, (on - i) / edge);
    pcm[i] = VOLUME * env * 0.5 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t));
  }
  buffer.copyToChannel(pcm, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(ctx.destination);
  src.start(ctx.currentTime + 0.05);
  return () => {
    try {
      src.stop();
    } catch {}
    void ctx.close().catch(() => {});
  };
}

/** Plays the ringback tone while `active` is true. */
export function useRingback(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    startRingback()
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch((e) => console.warn('ringback', e));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active]);
}
