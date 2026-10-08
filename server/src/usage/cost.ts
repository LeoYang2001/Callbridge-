import type { CallRecord, CallUsage } from '../../../shared/types';

/**
 * Estimated cost of a call at list prices, so pricing decisions rest on real usage. OpenAI
 * reports exact tokens per response; Twilio bills each call by the started minute. Prices are
 * per 1M tokens and per minute; override them with env if they change.
 */

export interface Prices {
  realtime: { audioIn: number; audioInCached: number; textIn: number; textInCached: number; audioOut: number; textOut: number };
  /** Input transcription (gpt-4o-transcribe), per 1M audio tokens. */
  transcription: number;
  /** Twilio US outbound, per started minute. */
  twilioPerMinute: number;
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function pricesFromEnv(env: NodeJS.ProcessEnv = process.env): Prices {
  return {
    realtime: {
      audioIn: num(env.PRICE_RT_AUDIO_IN, 32),
      audioInCached: num(env.PRICE_RT_AUDIO_IN_CACHED, 0.4),
      textIn: num(env.PRICE_RT_TEXT_IN, 4),
      textInCached: num(env.PRICE_RT_TEXT_IN_CACHED, 0.4),
      audioOut: num(env.PRICE_RT_AUDIO_OUT, 64),
      textOut: num(env.PRICE_RT_TEXT_OUT, 16),
    },
    transcription: num(env.PRICE_TRANSCRIBE_AUDIO_IN, 6),
    twilioPerMinute: num(env.PRICE_TWILIO_PER_MIN, 0.014),
  };
}

export const emptyUsage = (): CallUsage => ({ audioIn: 0, audioInCached: 0, textIn: 0, textInCached: 0, audioOut: 0, textOut: 0, transcriptionIn: 0, responses: 0 });

export function addUsage(total: CallUsage | undefined, u: Partial<CallUsage>): CallUsage {
  const t = total ?? emptyUsage();
  for (const k of Object.keys(t) as (keyof CallUsage)[]) t[k] += u[k] ?? 0;
  return t;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export function callCost(record: CallRecord, prices: Prices): { openai: number; twilio: number; total: number } {
  const u = record.metrics.usage ?? emptyUsage();
  const p = prices.realtime;
  const openai =
    (u.audioIn * p.audioIn + u.audioInCached * p.audioInCached + u.textIn * p.textIn + u.textInCached * p.textInCached + u.audioOut * p.audioOut + u.textOut * p.textOut + u.transcriptionIn * prices.transcription) /
    1_000_000;
  // Twilio bills from when the call is answered, per started minute.
  const m = record.metrics;
  const seconds = m.answeredAt !== undefined && m.endedAt !== undefined ? (m.endedAt - m.answeredAt) / 1000 : 0;
  const twilio = Math.ceil(seconds / 60) * prices.twilioPerMinute;
  return { openai: round(openai), twilio: round(twilio), total: round(openai + twilio) };
}
