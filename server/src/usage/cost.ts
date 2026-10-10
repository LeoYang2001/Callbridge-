import type { CallRecord, CallUsage } from '../../../shared/types';

/**
 * Estimated cost of a call at list prices, so pricing decisions rest on real usage. OpenAI
 * reports exact tokens per response; Twilio bills each call by the started minute. Prices are
 * per 1M tokens and per minute; override them with env if they change.
 */

export type RealtimePrices = { audioIn: number; audioInCached: number; textIn: number; textInCached: number; audioOut: number; textOut: number };

export interface Prices {
  realtime: RealtimePrices;
  /** The mini realtime model (setting up calls in the app). */
  realtimeMini: RealtimePrices;
  /** Per 1M tokens, by model family: input, cached input, output. */
  text: Record<'large' | 'standard' | 'mini', { in: number; cached: number; out: number }>;
  /** Per web search the research agent runs. */
  webSearch: number;
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
      textOut: num(env.PRICE_RT_TEXT_OUT, 24),
    },
    realtimeMini: {
      audioIn: num(env.PRICE_RT_MINI_AUDIO_IN, 10),
      audioInCached: num(env.PRICE_RT_MINI_AUDIO_IN_CACHED, 0.3),
      textIn: num(env.PRICE_RT_MINI_TEXT_IN, 0.6),
      textInCached: num(env.PRICE_RT_MINI_TEXT_IN_CACHED, 0.06),
      audioOut: num(env.PRICE_RT_MINI_AUDIO_OUT, 20),
      textOut: num(env.PRICE_RT_MINI_TEXT_OUT, 2.4),
    },
    // Estimates; check https://openai.com/api/pricing and override with env.
    text: {
      large: { in: num(env.PRICE_LARGE_IN, 5), cached: num(env.PRICE_LARGE_CACHED, 0.5), out: num(env.PRICE_LARGE_OUT, 30) },
      standard: { in: num(env.PRICE_STANDARD_IN, 2.5), cached: num(env.PRICE_STANDARD_CACHED, 0.25), out: num(env.PRICE_STANDARD_OUT, 15) },
      mini: { in: num(env.PRICE_MINI_IN, 0.75), cached: num(env.PRICE_MINI_CACHED, 0.075), out: num(env.PRICE_MINI_OUT, 4.5) },
    },
    webSearch: num(env.PRICE_WEB_SEARCH, 0.01),
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

/** A realtime response's `usage`, as reported by OpenAI, in our counters. */
export function realtimeUsage(u: any): Partial<CallUsage> {
  if (!u) return {};
  const inD = u.input_token_details ?? {};
  const cached = inD.cached_tokens_details ?? {};
  const outD = u.output_token_details ?? {};
  return {
    audioIn: Math.max(0, (inD.audio_tokens ?? 0) - (cached.audio_tokens ?? 0)),
    audioInCached: cached.audio_tokens ?? 0,
    textIn: Math.max(0, (inD.text_tokens ?? 0) - (cached.text_tokens ?? 0)),
    textInCached: cached.text_tokens ?? 0,
    audioOut: outD.audio_tokens ?? 0,
    textOut: outD.text_tokens ?? 0,
    responses: 1,
  };
}

/** What a realtime model's usage costs (USD). */
export function realtimeCost(u: Partial<CallUsage>, p: RealtimePrices, transcriptionPrice: number): number {
  const v = (k: keyof CallUsage) => u[k] ?? 0;
  return (
    (v('audioIn') * p.audioIn + v('audioInCached') * p.audioInCached + v('textIn') * p.textIn + v('textInCached') * p.textInCached + v('audioOut') * p.audioOut + v('textOut') * p.textOut + v('transcriptionIn') * transcriptionPrice) /
    1_000_000
  );
}

/** Prices for a realtime model: the mini one, or the full one. */
export const realtimePricesFor = (model: string, prices: Prices) => (/mini/.test(model) ? prices.realtimeMini : prices.realtime);

/** What a text model's tokens cost (USD), by its family: gpt-5.5 large, mini/nano mini, else standard. */
export function textCost(model: string, t: { input: number; cached: number; output: number }, prices: Prices): number {
  const family = /mini|nano/.test(model) ? 'mini' : /5\.5|5_5/.test(model) ? 'large' : 'standard';
  const p = prices.text[family];
  return (Math.max(0, t.input - t.cached) * p.in + t.cached * p.cached + t.output * p.out) / 1_000_000;
}

export function callCost(record: CallRecord, prices: Prices): { openai: number; twilio: number; total: number } {
  const openai = realtimeCost(record.metrics.usage ?? emptyUsage(), prices.realtime, prices.transcription);
  // Twilio bills from when the call is answered, per started minute.
  const m = record.metrics;
  const seconds = m.answeredAt !== undefined && m.endedAt !== undefined ? (m.endedAt - m.answeredAt) / 1000 : 0;
  const twilio = Math.ceil(seconds / 60) * prices.twilioPerMinute;
  return { openai: round(openai), twilio: round(twilio), total: round(openai + twilio) };
}
