import type { CallRequest } from '../../shared/types';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyRequest } from 'fastify';
import { CallManager } from './calls/callManager';
import { CallStore } from './calls/store';
import { isAllowedOrigin, loadConfig } from './config';
import { OpenAITaskClassifier } from './policy/taskClassifier';
import { OpenAIAnalyzer } from './providers/analysis/openaiAnalyzer';
import { OpenAITranslator } from './providers/translation/openaiTranslator';
import { TwilioTelephony } from './providers/telephony/twilio';
import { OpenAIRealtimeAgent } from './providers/voice/openaiRealtime';
import { LogOtp, OtpRateLimit, TwilioVerifyOtp } from './auth/otp';
import { Database } from './db/database';
import { learnFromCall } from './profile/profile';
import { ErrandQueue } from './errands/errandQueue';
import { sendDueReminders } from './reminders/reminders';
import { registerErrandRoutes } from './routes/errands';
import { ExpoPush, finishedNotification, questionNotification, type PushMessage } from './push/push';
import { registerApiRoutes, withUserSettings } from './routes/api';
import { registerAuthRoutes } from './routes/auth';
import { GooglePlaces } from './places/places';
import { OpenAIResearcher } from './research/researcher';
import { registerResearchRoutes } from './routes/research';
import { registerListenRoutes } from './routes/listen';
import { registerIntakeRoutes } from './routes/intake';
import { registerTwilioRoutes } from './routes/twilio';
import { registerVoiceRoutes } from './routes/voices';

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
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
});

// Sign-in: every /api route except these needs `Authorization: Bearer <session token>`, which
// the app gets by verifying a code sent to the user's phone. Twilio routes authenticate separately
// (webhook signatures + a per-call stream token).
const db = new Database(path.resolve(root, config.DATABASE_FILE));
/** Call recordings (replayed with the transcript in the app). */
const recordingsDir = path.join(root, 'data', 'recordings');
/** Recording and caller ID from the user's settings (errands are started here, not by a request). */
const withRecording = (request: CallRequest, userId: string): CallRequest => {
  const user = db.userById(userId);
  return user ? withUserSettings(request, user) : { ...request, record: true };
};
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
  recordingsDir,
  otp,
  perPhone: new OtpRateLimit(5),
  perAddress: new OtpRateLimit(20),
  signupAllowlist: config.signupAllowlist,
});

const store = new CallStore(config.PERSIST_CALLS ? path.join(root, 'data', 'calls') : null, db);

const telephony = config.telephonyConfigured
  ? new TwilioTelephony({
      accountSid: config.TWILIO_ACCOUNT_SID!,
      authToken: config.TWILIO_AUTH_TOKEN!,
      fromNumber: config.TWILIO_FROM_NUMBER!,
      publicBaseUrl: config.PUBLIC_BASE_URL!,
    }, undefined, (msg) => app.log.warn(msg))
  : null;
const analyzer = config.OPENAI_API_KEY ? new OpenAIAnalyzer(config.OPENAI_API_KEY, config.ANALYSIS_MODEL) : null;
const translator = config.OPENAI_API_KEY ? new OpenAITranslator(config.OPENAI_API_KEY, config.TRANSLATION_MODEL) : null;

const logCallEvent = (callId: string, type: string, detail?: string) => {
  app.log.info({ callId, event: type, detail }, type);
  store.update(callId, (r) => r.events.push({ at: Date.now(), type, detail }));
};

// Push notifications to the user's phones (the mobile app); the web app doesn't register any.
const push = new ExpoPush((msg) => app.log.warn(msg));
const notify = (userId: string | undefined, message: Omit<PushMessage, 'to'>) => {
  // Hold questions always notify (someone is waiting); results only if the user wants them.
  if (userId && message.data.kind !== 'question' && db.userById(userId)?.profile.notify?.results === false) return;
  const tokens = userId ? db.pushTokensFor(userId) : [];
  if (!tokens.length) return;
  push
    .send(tokens.map((to) => ({ ...message, to })))
    .then((dead) => dead.forEach((t) => db.removePushToken(t)))
    .catch((err) => app.log.warn({ err }, 'push failed'));
};

const manager = new CallManager(
  store,
  () => ({
    telephony: telephony!,
    createAgent: (voice) =>
      new OpenAIRealtimeAgent({
        apiKey: config.OPENAI_API_KEY!,
        model: config.REALTIME_MODEL,
        voice: voice ?? config.REALTIME_VOICE,
        transcriptionModel: config.TRANSCRIPTION_MODEL,
        turnDetection: config.REALTIME_TURN_DETECTION,
        reasoningEffort: config.REALTIME_REASONING_EFFORT,
        log: (type, detail) => app.log.debug({ event: type, detail }, type),
      }),
    analyzer,
    translator,
    maxCallSeconds: config.MAX_CALL_SECONDS,
    introDelayMs: config.INTRO_DELAY_MS,
    holdTimeoutMs: config.HOLD_TIMEOUT_SECONDS * 1000,
    recordingsDir,
    log: logCallEvent,
  }),
  {
    allowedDestinations: config.allowedDestinations,
    maxCallsPerHour: config.MAX_CALLS_PER_HOUR,
    maxConcurrentCalls: 1,
    // Every finished call adds to its user's profile: the contact, an appointment, decisions.
    onCallFinished: (record) => {
      const user = record.userId ? db.userById(record.userId) : undefined;
      if (user) db.saveProfile(user.id, learnFromCall(user.profile, record));
      // An errand's call reports through the queue (one summary, not one push per call or retry).
      if (!errands.callFinished(record)) notify(record.userId, finishedNotification(record));
    },
    onUserQuestion: (record, question) => notify(record.userId, questionNotification(record, question)),
  },
);

const checkDeps = {
  classifier: config.OPENAI_API_KEY ? new OpenAITaskClassifier(config.OPENAI_API_KEY, config.ANALYSIS_MODEL) : null,
  allowedDestinations: config.allowedDestinations,
};
registerApiRoutes(app, { config, manager, store, checkDeps, db, recordingsDir, telephony });

// Errands: calls the server places later, on its own, while the user does something else.
const errands = new ErrandQueue({
  db,
  startCall: (request, userId) => manager.startCall(withRecording(request, userId), userId),
  lineFree: () => manager.activeCount === 0,
  isLive: (callId) => manager.isLive(callId),
  callRecord: (callId) => store.getOrLoad(callId),
  notify: (userId, message) => notify(userId, message),
  log: (message, detail) => app.log.info(detail ?? {}, message),
  options: { maxCallsPerDay: config.ERRAND_MAX_CALLS_PER_DAY },
});
registerErrandRoutes(app, { config, queue: errands, manager, checkDeps });
if (config.telephonyConfigured && config.voiceConfigured) errands.start();

// Day-before appointment reminders (they have their own switch, so they skip the results check).
const sendReminder = (userId: string, message: Omit<PushMessage, 'to'>) => {
  const tokens = db.pushTokensFor(userId);
  if (tokens.length) void push.send(tokens.map((to) => ({ ...message, to }))).catch((err) => app.log.warn({ err }, 'reminder push failed'));
};
setInterval(() => sendDueReminders(db, sendReminder), 15 * 60_000).unref();
registerIntakeRoutes(app, { config, checkDeps, store, db });
registerListenRoutes(app, { manager, store });
registerVoiceRoutes(app, {
  apiKey: config.OPENAI_API_KEY,
  cacheDir: path.resolve(root, 'data/voice-samples'),
  // A sample is a few seconds of text-to-speech, made once per voice and language.
  onMade: (userId, detail) => db.addUsage(userId, 'voice_sample', 0.003, detail),
});
registerResearchRoutes(app, {
  researcher: config.OPENAI_API_KEY
    ? new OpenAIResearcher(
        config.OPENAI_API_KEY,
        { quick: config.RESEARCH_MODEL_QUICK, thorough: config.RESEARCH_MODEL_THOROUGH },
        { googlePlaces: config.GOOGLE_PLACES_API_KEY ? new GooglePlaces(config.GOOGLE_PLACES_API_KEY) : null },
      )
    : null,
  perUser: new OtpRateLimit(30),
  db,
});
if (telephony) registerTwilioRoutes(app, { config, manager, telephony });

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
