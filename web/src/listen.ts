import { listenTicket } from './api';
import type { Settings } from './settings';

/**
 * Plays a call live: the other party and the assistant, as the server relays them (G.711 μ-law,
 * 8 kHz). Each side keeps its own playback clock: the other party arrives in real time, the
 * assistant's audio in bursts, and a "clear" (they interrupted it) drops the assistant's queue.
 * start() must run from a tap: browsers only allow sound after a user gesture.
 */

const JITTER_S = 0.25; // a small buffer so network hiccups don't cause gaps

function ulawToFloat(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return (sign ? -magnitude : magnitude) / 32768;
}

export interface Listener {
  stop: () => void;
}

export async function startListening(settings: Settings, callId: string, onEnd: (reason: string) => void): Promise<Listener> {
  const ctx = new AudioContext();
  await ctx.resume();
  const { ticket } = await listenTicket(settings, callId);
  const base = (settings.serverUrl.trim() || location.origin).replace(/^http/, 'ws').replace(/\/+$/, '');
  const ws = new WebSocket(`${base}/listen/${callId}?ticket=${encodeURIComponent(ticket)}`);

  const clock = { them: 0, ai: 0 };
  const aiSources = new Set<AudioBufferSourceNode>();

  const play = (track: 'them' | 'ai', b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!bytes.length) return;
    const buffer = ctx.createBuffer(1, bytes.length, 8000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bytes.length; i++) data[i] = ulawToFloat(bytes[i]!);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    // Fell behind (a gap, or just started)? Restart the clock a little ahead of now.
    const startAt = Math.max(clock[track], ctx.currentTime + (clock[track] < ctx.currentTime ? JITTER_S : 0));
    src.start(startAt);
    clock[track] = startAt + buffer.duration;
    if (track === 'ai') {
      aiSources.add(src);
      src.onended = () => aiSources.delete(src);
    }
  };

  const stop = () => {
    ws.close();
    for (const s of aiSources) s.stop();
    void ctx.close();
  };

  ws.onmessage = (msg) => {
    const e = JSON.parse(msg.data as string) as { t: 'them' | 'ai' | 'clear' | 'end'; a?: string };
    if ((e.t === 'them' || e.t === 'ai') && e.a) play(e.t, e.a);
    else if (e.t === 'clear') {
      for (const s of aiSources) s.stop();
      aiSources.clear();
      clock.ai = ctx.currentTime;
    }
  };
  ws.onclose = (e) => {
    onEnd(e.code === 1000 ? 'The call ended.' : e.reason || 'Stopped listening.');
    void ctx.close().catch(() => {});
  };
  return { stop };
}
