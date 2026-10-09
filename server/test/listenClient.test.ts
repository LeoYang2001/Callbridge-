import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { resample, startListening, type ListenOutput } from '../../shared/client/listen';
import type { CallRecord } from '../../shared/types';
import type { ListenEvent } from '../src/calls/callSession';
import type { CallManager } from '../src/calls/callManager';
import type { CallStore } from '../src/calls/store';
import { registerListenRoutes } from '../src/routes/listen';

/**
 * Live listening end to end, minus the speaker: the server's real listen route streams μ-law
 * audio over a WebSocket, and the shared client (what the phone runs) decodes and schedules it.
 */

const servers: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

const waitFor = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('live listening, server to client', () => {
  it('plays both sides, drops the assistant on an interruption, and ends with the call', async () => {
    let emit: ((e: ListenEvent) => void) | null = null;
    const manager = { listen: (_id: string, fn: (e: ListenEvent) => void) => ((emit = fn), () => (emit = null)) } as unknown as CallManager;
    const store = { get: (id: string) => ({ id, userId: 'u1' }) as CallRecord } as unknown as CallStore;
    const app = Fastify();
    await app.register(websocket);
    app.addHook('onRequest', async (req) => {
      req.user = { id: 'u1' } as never;
    });
    registerListenRoutes(app, { manager, store });
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    servers.push(app);

    const played: { track: number; samples: number; when: number; stopped: boolean }[] = [];
    let clock = 0;
    let closed = false;
    const output: ListenOutput = {
      currentTime: () => clock,
      play: (samples, rate, when) => {
        const sound = { track: played.length, samples: samples.length, when, stopped: false };
        played.push(sound);
        return { duration: samples.length / rate, stop: () => (sound.stopped = true), onEnded: () => {} };
      },
      close: () => (closed = true),
    };
    let ended = '';
    await startListening({ serverUrl: url, sessionToken: 't' }, 'call-1', output, (reason) => (ended = reason));
    await waitFor(() => emit !== null);

    const ulaw = (n: number) => Buffer.alloc(n, 0x7f).toString('base64');
    emit!({ t: 'them', a: ulaw(160) }); // 20 ms of the other party
    emit!({ t: 'ai', a: ulaw(800) }); // 100 ms of the assistant
    await waitFor(() => played.length === 2);
    expect(played[0]!.samples).toBe(160);
    expect(played[1]!.samples).toBe(800);
    // Both start a little after "now" (a jitter buffer), each side on its own clock.
    expect(played[0]!.when).toBeGreaterThan(0);

    emit!({ t: 'clear' }); // they interrupted the assistant: its queued audio stops
    await waitFor(() => played[1]!.stopped);
    expect(played[0]!.stopped).toBe(false);

    emit!({ t: 'end' });
    await waitFor(() => ended !== '');
    expect(ended).toBe('The call ended.');
    expect(closed).toBe(true);
    clock = 1;
  });
});

describe('resample', () => {
  it('keeps the duration when converting call audio to the device rate', () => {
    const chunk = new Float32Array(160).map((_, i) => Math.sin(i / 5));
    for (const rate of [44100, 48000]) {
      const out = resample(chunk, 8000, rate);
      expect(out.length / rate).toBeCloseTo(160 / 8000, 4);
      expect(out[0]).toBeCloseTo(chunk[0]!);
      // Halfway between two source samples, the value is between them.
      expect(out[3]).toBeCloseTo((chunk[0]! + chunk[1]!) / 2, 1);
    }
  });

  it('returns the same samples when the rates match', () => {
    const chunk = new Float32Array([0.1, 0.2]);
    expect(resample(chunk, 8000, 8000)).toBe(chunk);
  });
});
