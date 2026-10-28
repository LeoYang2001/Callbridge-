import { z } from 'zod';
import { normalizePhone } from './util/phone';

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const EnvSchema = z.object({
  PORT: int(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Public https URL that Twilio can reach, e.g. an ngrok tunnel. No trailing slash. */
  PUBLIC_BASE_URL: optionalString.transform((v) => v?.replace(/\/+$/, '')),
  /**
   * Extra comma-separated browser origins allowed to call the API cross-origin (the hosted UI,
   * e.g. https://callbridge.byte2bite.tech). Always allowed: https://<name>.github.io,
   * https://<name>.pages.dev and local dev servers.
   */
  CORS_ORIGINS: optionalString,

  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM_NUMBER: optionalString,
  /** Validate X-Twilio-Signature on webhooks. Disable only for local debugging. */
  TWILIO_VALIDATE_SIGNATURES: bool(true),

  OPENAI_API_KEY: optionalString,
  REALTIME_MODEL: z.string().default('gpt-realtime-2.1'),
  /** Setting up a call in the app (simple questions and answers): the cheaper mini model. Phone calls use REALTIME_MODEL. */
  INTAKE_REALTIME_MODEL: z.string().default('gpt-realtime-2.1-mini'),
  REALTIME_VOICE: z.string().default('marin'),
  /**
   * Who speaks on calls. "openai": the realtime model's own voice (REALTIME_VOICE) in every
   * language. "elevenlabs": the realtime model listens and decides what to say, and an
   * ElevenLabs voice for the call's language speaks it, so each language can have a native
   * speaker's voice and accent.
   */
  VOICE_ENGINE: z.enum(['openai', 'elevenlabs']).default('openai'),
  ELEVENLABS_API_KEY: optionalString,
  ELEVENLABS_MODEL: z.string().default('eleven_flash_v2_5'),
  /** Voice per call language, by language code: "en=<voice id>,zh=<voice id>,ja=…" (yue for Cantonese). */
  ELEVENLABS_VOICES: optionalString,
  /** Voice for languages without their own entry. Empty: those calls use the OpenAI voice. */
  ELEVENLABS_VOICE: optionalString,
  /** Only sent for reasoning-capable realtime models (gpt-realtime-2*). */
  REALTIME_REASONING_EFFORT: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']).default('low'),
  REALTIME_TURN_DETECTION: z.enum(['semantic_vad', 'server_vad']).default('semantic_vad'),
  TRANSCRIPTION_MODEL: z.string().default('gpt-4o-transcribe'),
  ANALYSIS_MODEL: z.string().default('gpt-5.4-mini'),
  /** Translated calls: live speech-to-speech translation, both directions. */
  TRANSLATE_MODEL: z.string().default('gpt-realtime-translate'),
  /** The interpreter's spoken "I've joined" notice, made with text-to-speech. */
  ANNOUNCE_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  /** Translates the live transcript into the user's language, one line at a time. */
  TRANSLATION_MODEL: z.string().default('gpt-5.4-mini'),

  /**
   * The research agent (GPT + web search) that the assistants ask to look things up. "quick" for
   * simple lookups (~10 s), "thorough" for questions with several conditions (~30-40 s).
   */
  RESEARCH_MODEL_QUICK: z.string().default('gpt-5.4-mini'),
  RESEARCH_MODEL_THOROUGH: z.string().default('gpt-5.5'),
  /** Optional: gives the research agent verified Google Maps listings as a tool. */
  GOOGLE_PLACES_API_KEY: optionalString,
  /** In-app joining (Twilio Voice SDK): an API key and the TwiML App whose voice URL is /twilio/client-voice. */
  TWILIO_API_KEY_SID: optionalString,
  TWILIO_API_KEY_SECRET: optionalString,
  TWILIO_TWIML_APP_SID: optionalString,
  /** SQLite file for users, sessions, profiles, and call history. */
  DATABASE_FILE: z.string().default('data/callbridge.db'),
  /**
   * How sign-in codes are delivered: "verify" (Twilio Verify SMS, needs TWILIO_VERIFY_SERVICE_SID)
   * or "log" (printed in the server log; for testing on your own laptop only).
   */
  AUTH_CODES: z.enum(['verify', 'log']).optional(),
  TWILIO_VERIFY_SERVICE_SID: optionalString,
  /** Comma-separated numbers allowed to create an account (invite-only). Empty: anyone can sign up. */
  SIGNUP_ALLOWLIST: optionalString,

  /** Comma-separated E.164 numbers. When set, only these numbers can be called. */
  ALLOWED_DESTINATIONS: optionalString,
  MAX_CALL_SECONDS: int(600),
  MAX_CALLS_PER_HOUR: int(10),
  /** Calls the errand queue may place per user per 24 hours. */
  ERRAND_MAX_CALLS_PER_DAY: int(20),
  /** How long the other party holds while the user answers a question in the app. */
  HOLD_TIMEOUT_SECONDS: int(30),
  /** Wait this long after answer for the other side to speak before introducing ourselves. */
  INTRO_DELAY_MS: int(2500),
  /** Write finished call records (including transcripts) to ./data/calls for debugging. */
  PERSIST_CALLS: bool(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  allowedDestinations: string[] | null;
  signupAllowlist: string[] | null;
  authCodes: 'verify' | 'log';
  corsOrigins: string[] | null;
  telephonyConfigured: boolean;
  voiceConfigured: boolean;
  /** ELEVENLABS_VOICES parsed: language code → voice id. */
  elevenLabsVoices: Record<string, string>;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  if (c.VOICE_ENGINE === 'elevenlabs' && !c.ELEVENLABS_API_KEY) {
    throw new Error('Invalid environment configuration:\n  VOICE_ENGINE=elevenlabs needs ELEVENLABS_API_KEY');
  }
  const elevenLabsVoices: Record<string, string> = {};
  for (const pair of (c.ELEVENLABS_VOICES ?? '').split(',')) {
    const [lang, id] = pair.split('=').map((s) => s.trim());
    if (lang && id) elevenLabsVoices[lang.toLowerCase()] = id;
  }
  return {
    elevenLabsVoices,
    ...c,
    // Accept "7475550123" or "(747) 555-0123" as well as E.164, so a hand-edited .env still matches.
    allowedDestinations: c.ALLOWED_DESTINATIONS
      ? c.ALLOWED_DESTINATIONS.split(',')
          .map((s) => normalizePhone(s) ?? s.trim())
          .filter(Boolean)
      : null,
    signupAllowlist: c.SIGNUP_ALLOWLIST
      ? c.SIGNUP_ALLOWLIST.split(',')
          .map((s) => normalizePhone(s) ?? s.trim())
          .filter(Boolean)
      : null,
    authCodes: c.AUTH_CODES ?? (c.TWILIO_VERIFY_SERVICE_SID ? 'verify' : 'log'),
    corsOrigins: c.CORS_ORIGINS
      ? c.CORS_ORIGINS.split(',')
          .map((s) => s.trim().replace(/\/+$/, ''))
          .filter(Boolean)
      : null,
    TWILIO_FROM_NUMBER: c.TWILIO_FROM_NUMBER ? (normalizePhone(c.TWILIO_FROM_NUMBER) ?? c.TWILIO_FROM_NUMBER) : undefined,
    telephonyConfigured: Boolean(
      c.TWILIO_ACCOUNT_SID && c.TWILIO_AUTH_TOKEN && c.TWILIO_FROM_NUMBER && c.PUBLIC_BASE_URL,
    ),
    voiceConfigured: Boolean(c.OPENAI_API_KEY),
  };
}

const DEFAULT_ORIGIN = /^(https:\/\/[a-z0-9-]+\.(github\.io|pages\.dev)|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;

export function isAllowedOrigin(origin: string, extra: string[] | null): boolean {
  return DEFAULT_ORIGIN.test(origin) || Boolean(extra?.includes(origin));
}
