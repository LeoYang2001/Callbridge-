import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyRequest } from 'fastify';
import { LogOtp, OtpRateLimit, TwilioVerifyOtp } from './auth/otp';
import { TranslatedCallManager } from './calls/translatedCallManager';
import { isAllowedOrigin, loadConfig } from './config';
import { Database } from './db/database';
import { learnFromCall } from './profile/profile';
import { TwilioTelephony } from './providers/telephony/twilio';
import { speakForPhone } from './providers/translation/announce';
import { LiveTranslation } from './providers/translation/liveTranslation';
import { registerApiRoutes } from './routes/api';
import { registerAuthRoutes } from './routes/auth';
import { registerTranslatedCallRoutes } from './routes/translatedCalls';
import { registerTwilioRoutes } from './routes/twilio';

const config = loadConfig();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    // Never log credentials. Request bodies are not logged at all.
    redact: ['req.headers.authorization', 'req.headers["x-twilio-signature"]'],
  },
  trustProxy: true,
});

await app.register(formbody);
await app.register(websocket);

// The hosted UI (GitHub Pages) calls this server cross-origin. CORS is not the security boundary
// (sign-in is); it only lets browsers on the allowed origins read responses.
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin, config.corsOrigins)),
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
});

// Sign-in: every /api route except these needs `Authorization: Bearer <session token>`, which
// the app gets by verifying a code sent to the user's phone. Twilio routes authenticate separately
// (webhook signatures + a per-call stream token).
const db = new Database(path.resolve(root, config.DATABASE_FILE));
const PUBLIC_API = new Set(['/api/health', '/api/config', '/api/auth/start', '/api/auth/verify']);
app.addHook('onRequest', async (req: FastifyRequest, reply) => {
  if (req.method === 'OPTIONS' || !req.url.startsWith('/api/') || PUBLIC_API.has(req.url.split('?')[0]!)) return;
  const [scheme, token = ''] = (req.headers.authorization ?? '').split(' ');
  const user = scheme === 'Bearer' && token ? db.userForToken(token) : undefined;
  if (!user) return reply.code(401).send({ error: 'Sign in to continue.' });
  req.user = user;
  req.sessionToken = token;
});

const otp =
  config.authCodes === 'verify' && config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_VERIFY_SERVICE_SID
    ? new TwilioVerifyOtp(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, config.TWILIO_VERIFY_SERVICE_SID)
    : new LogOtp((message) => app.log.warn(message));
registerAuthRoutes(app, {
  db,
  otp,
  perPhone: new OtpRateLimit(5),
  perAddress: new OtpRateLimit(20),
  signupAllowlist: config.signupAllowlist,
});

const telephony = config.telephonyConfigured
  ? new TwilioTelephony({
      accountSid: config.TWILIO_ACCOUNT_SID!,
      authToken: config.TWILIO_AUTH_TOKEN!,
      fromNumber: config.TWILIO_FROM_NUMBER!,
      publicBaseUrl: config.PUBLIC_BASE_URL!,
    }, undefined, (msg) => app.log.warn(msg))
  : null;

// Translated calls: the user talks to them directly; captions and an optional AI interpreter.
const translatedCalls = new TranslatedCallManager(
  () => ({
    telephony: telephony!,
    createTranslation: (targetLanguage) =>
      new LiveTranslation({ apiKey: config.OPENAI_API_KEY!, model: config.TRANSLATE_MODEL, targetLanguage, transcriptionModel: config.TRANSCRIPTION_MODEL }),
    speak: (text) => speakForPhone({ apiKey: config.OPENAI_API_KEY!, model: config.ANNOUNCE_TTS_MODEL, voice: config.ANNOUNCE_VOICE }, text),
    maxCallSeconds: config.MAX_CALL_SECONDS,
    log: (callId, type, detail) => app.log.info({ callId, event: type, detail }, type),
  }),
  {
    allowedDestinations: config.allowedDestinations,
    maxCallsPerHour: config.MAX_CALLS_PER_HOUR,
    // Every finished call goes in the history and keeps the phone book current.
    onFinished: (record) => {
      db.saveCall(record);
      const user = record.userId ? db.userById(record.userId) : undefined;
      if (user) db.saveProfile(user.id, learnFromCall(user.profile, record));
    },
    load: (id) => db.call(id),
  },
);
registerApiRoutes(app, { config, manager: translatedCalls, db, telephony });
registerTranslatedCallRoutes(app, { config, manager: translatedCalls, db });
if (telephony) registerTwilioRoutes(app, { config, manager: translatedCalls, telephony });

const webDist = path.join(root, 'web', 'dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
} else {
  app.get('/', async () => 'Web UI not built. Run `npm run dev` and open http://localhost:5173, or `npm run build` first.');
}

await app.listen({ port: config.PORT, host: config.HOST });

if (!config.telephonyConfigured) app.log.warn('Twilio is not configured (TWILIO_* and PUBLIC_BASE_URL). Calls are disabled.');
if (!config.voiceConfigured) app.log.warn('OPENAI_API_KEY is not set. Calls are disabled.');
if (config.authCodes === 'log') app.log.warn('Sign-in codes are printed in this log (AUTH_CODES=log). Use Twilio Verify before anyone else can reach this server.');
if (!config.signupAllowlist) app.log.warn('SIGNUP_ALLOWLIST is not set: anyone with the link can create an account and place calls.');
if (!config.allowedDestinations) app.log.warn('ALLOWED_DESTINATIONS is not set: any valid number can be called. Set it while testing.');
