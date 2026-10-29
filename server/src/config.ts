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
  /** Live speech-to-speech translation, both directions of a call. */
  TRANSLATE_MODEL: z.string().default('gpt-realtime-translate'),
  /** Transcript of what each person said, in their own language (shown under the translation). */
  TRANSCRIPTION_MODEL: z.string().default('gpt-4o-transcribe'),
  /** The interpreter's spoken notices ("an AI interpreter has joined", Ask for me), made with text-to-speech. */
  ANNOUNCE_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  ANNOUNCE_VOICE: z.string().default('marin'),
  /** Calling from the app (Twilio Voice SDK): an API key and the TwiML App whose voice URL is /twilio/client-voice. */
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  allowedDestinations: string[] | null;
  signupAllowlist: string[] | null;
  authCodes: 'verify' | 'log';
  corsOrigins: string[] | null;
  telephonyConfigured: boolean;
  voiceConfigured: boolean;
  inAppCalling: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  return {
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
    inAppCalling: Boolean(c.TWILIO_API_KEY_SID && c.TWILIO_API_KEY_SECRET && c.TWILIO_TWIML_APP_SID),
  };
}

const DEFAULT_ORIGIN = /^(https:\/\/[a-z0-9-]+\.(github\.io|pages\.dev)|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;

export function isAllowedOrigin(origin: string, extra: string[] | null): boolean {
  return DEFAULT_ORIGIN.test(origin) || Boolean(extra?.includes(origin));
}
