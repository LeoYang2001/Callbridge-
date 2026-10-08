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
