import { endpoint, listenTicket, type Connection } from './api';

/**
 * Plays a call live: the other party and the assistant, as the server relays them (G.711 μ-law,
 * 8 kHz). Each side keeps its own playback clock: the other party arrives in real time, the
 * assistant's audio in bursts, and a "clear" (they interrupted it) drops the assistant's queue.
 *
 * The sound itself comes from the platform: Web Audio in the browser, react-native-audio-api on
 * the phone (the same API shape), behind the small ListenOutput interface.
 */

const JITTER_S = 0.25; // a small buffer so network hiccups don't cause gaps
const SAMPLE_RATE = 8000;

export function ulawToFloat(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return (sign ? -magnitude : magnitude) / 32768;
}

export function decodeUlawBase64(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = ulawToFloat(bin.charCodeAt(i));
  return out;
}

export interface ScheduledSound {
  stop: () => void;
  onEnded: (fn: () => void) => void;
}

export interface ListenOutput {
  /** The audio clock, in seconds. */
  currentTime: () => number;
  /** Plays mono samples starting at `when` (on the audio clock); returns its duration in seconds. */
  play: (samples: Float32Array<ArrayBuffer>, sampleRate: number, when: number) => ScheduledSound & { duration: number };
  close: () => void;
}

export interface Listener {
  stop: () => void;
}

export async function startListening(s: Connection, callId: string, output: ListenOutput, onEnd: (reason: string) => void): Promise<Listener> {
  const { ticket } = await listenTicket(s, callId);
  // An empty server URL means the same origin (the web app served by the server).
  const origin = endpoint(s, '') || ((globalThis as { location?: { origin: string } }).location?.origin ?? '');
  const base = origin.replace(/^http/, 'ws');
  const ws = new WebSocket(`${base}/listen/${callId}?ticket=${encodeURIComponent(ticket)}`);

  const clock = { them: 0, ai: 0 };
  const aiSounds = new Set<ScheduledSound>();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    output.close();
  };

  const play = (track: 'them' | 'ai', b64: string) => {
    const samples = decodeUlawBase64(b64);
    if (!samples.length || closed) return;
    const now = output.currentTime();
    // Fell behind (a gap, or just started)? Restart the clock a little ahead of now.
    const startAt = Math.max(clock[track], now + (clock[track] <= now ? JITTER_S : 0));
    const sound = output.play(samples, SAMPLE_RATE, startAt);
    clock[track] = startAt + sound.duration;
    if (track === 'ai') {
      aiSounds.add(sound);
      sound.onEnded(() => aiSounds.delete(sound));
    }
  };

  const stopAi = () => {
    for (const sound of aiSounds) sound.stop();
    aiSounds.clear();
    clock.ai = output.currentTime();
  };

  ws.onmessage = (msg) => {
    const e = JSON.parse(msg.data as string) as { t: 'them' | 'ai' | 'clear' | 'end'; a?: string };
    if ((e.t === 'them' || e.t === 'ai') && e.a) play(e.t, e.a);
    else if (e.t === 'clear') stopAi();
  };
  ws.onclose = (e) => {
    onEnd(e.code === 1000 ? 'The call ended.' : e.reason || 'Stopped listening.');
    close();
  };
  return {
    stop: () => {
      ws.close();
      stopAi();
      close();
    },
  };
}
