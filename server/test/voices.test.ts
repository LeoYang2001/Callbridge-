import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerVoiceRoutes, sampleLanguage } from '../src/routes/voices';

describe('voice samples', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('picks the sample language, falling back to English', () => {
    expect(sampleLanguage('Chinese (Mandarin)')).toBe('zh');
    expect(sampleLanguage('Chinese (Cantonese)')).toBe('yue');
    expect(sampleLanguage('Spanish')).toBe('es');
    expect(sampleLanguage('Hmong')).toBe('en');
  });

  it('makes a sample once, then serves it from disk', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cb-voices-'));
    dirs.push(dir);
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ voice: 'cedar', input: expect.stringContaining('CallBridge 助手') });
      return new Response(new Uint8Array([82, 73, 70, 70]));
    });
    vi.stubGlobal('fetch', fetch);
    const app = Fastify();
    registerVoiceRoutes(app, { apiKey: 'sk-test', cacheDir: dir });

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ url: '/api/voices/cedar/sample?language=Chinese%20(Mandarin)' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('audio/wav');
      expect(res.rawPayload.toString()).toBe('RIFF');
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await app.inject({ url: '/api/voices/nobody/sample' })).statusCode).toBe(404);
  });
});
