import { describe, expect, it } from 'vitest';
import { newCallRecord } from '../src/calls/callSession';
import { addUsage, callCost, pricesFromEnv } from '../src/usage/cost';
import { dentistRequest } from './fixtures';

describe('call cost', () => {
  it('adds up OpenAI tokens at list prices and Twilio by the started minute', () => {
    const r = newCallRecord('c1', dentistRequest());
    let u = addUsage(undefined, { audioIn: 1000, audioInCached: 4000, textIn: 5000, textInCached: 20_000, audioOut: 1500, textOut: 300, responses: 1 });
    u = addUsage(u, { transcriptionIn: 800 });
    r.metrics.usage = u;
    r.metrics.answeredAt = 0;
    r.metrics.endedAt = 125_000; // 2:05 → 3 started minutes
    const cost = callCost(r, pricesFromEnv({}));
    // 1000×32 + 4000×0.4 + 5000×4 + 20000×0.4 + 1500×64 + 300×16 + 800×6 = 167,200 per 1M → $0.1672
    expect(cost).toEqual({ openai: 0.1672, twilio: 0.042, total: 0.2092 });
  });
});

describe('usage outside calls', () => {
  it('prices a reply on the mini realtime model well below the full one', async () => {
    const { pricesFromEnv, realtimeCost, realtimePricesFor, realtimeUsage, textCost } = await import('../src/usage/cost');
    const prices = pricesFromEnv({});
    const u = realtimeUsage({ input_token_details: { text_tokens: 4000, audio_tokens: 500, cached_tokens_details: { text_tokens: 3000 } }, output_token_details: { audio_tokens: 600, text_tokens: 80 } });
    expect(u).toMatchObject({ textIn: 1000, textInCached: 3000, audioIn: 500, audioOut: 600, textOut: 80, responses: 1 });
    const full = realtimeCost(u, realtimePricesFor('gpt-realtime-2.1', prices), prices.transcription);
    const mini = realtimeCost(u, realtimePricesFor('gpt-realtime-mini', prices), prices.transcription);
    expect(mini).toBeLessThan(full / 2.5);
    // gpt-5.5 is priced as the large family, gpt-5.4-mini as mini.
    const t = { input: 20_000, cached: 0, output: 1_000 };
    expect(textCost('gpt-5.5', t, prices)).toBeGreaterThan(textCost('gpt-5.4-mini', t, prices) * 4);
  });
});
