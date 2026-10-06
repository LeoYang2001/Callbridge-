import { timingSafeEqual } from 'node:crypto';
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
import { OpenAIAnalyzer } from './providers/analysis/openaiAnalyzer';
import { TwilioTelephony } from './providers/telephony/twilio';
import { OpenAIRealtimeAgent } from './providers/voice/openaiRealtime';
import { registerApiRoutes } from './routes/api';
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
// (APP_PASSWORD is); it only lets browsers on the allowed origins read responses.
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin, config.corsOrigins)),
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
});

// Optional shared-password gate for the UI and API: `Authorization: Bearer <APP_PASSWORD>` from the
// hosted UI, or HTTP basic auth (any username) when the UI is served by this server. Twilio routes
// authenticate separately (webhook signatures + a per-call stream token).
if (config.APP_PASSWORD) {
  const expected = Buffer.from(config.APP_PASSWORD);
  const matches = (candidate: string) => {
    const c = Buffer.from(candidate);
    return c.length === expected.length && timingSafeEqual(c, expected);
  };
  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (req.method === 'OPTIONS' || req.url.startsWith('/twilio/') || req.url === '/api/health') return;
    const [scheme, value = ''] = (req.headers.authorization ?? '').split(' ');
    const password =
      scheme === 'Bearer' ? value : scheme === 'Basic' ? Buffer.from(value, 'base64').toString().split(':').slice(1).join(':') : '';
    if (!matches(password)) {
      // Only prompt for basic auth on same-origin page loads; API clients get a plain 401.
      if (!req.url.startsWith('/api/')) reply.header('WWW-Authenticate', 'Basic realm="CallBridge"');
      return reply.code(401).send({ error: 'Authentication required' });
    }
  });
}

const store = new CallStore(config.PERSIST_CALLS ? path.join(root, 'data', 'calls') : null);

const telephony = config.telephonyConfigured
  ? new TwilioTelephony({
      accountSid: config.TWILIO_ACCOUNT_SID!,
      authToken: config.TWILIO_AUTH_TOKEN!,
      fromNumber: config.TWILIO_FROM_NUMBER!,
      publicBaseUrl: config.PUBLIC_BASE_URL!,
    })
  : null;
const analyzer = config.OPENAI_API_KEY ? new OpenAIAnalyzer(config.OPENAI_API_KEY, config.ANALYSIS_MODEL) : null;

const logCallEvent = (callId: string, type: string, detail?: string) => {
  app.log.info({ callId, event: type, detail }, type);
  store.update(callId, (r) => r.events.push({ at: Date.now(), type, detail }));
};

const manager = new CallManager(
  store,
  () => ({
    telephony: telephony!,
    createAgent: () =>
      new OpenAIRealtimeAgent({
        apiKey: config.OPENAI_API_KEY!,
        model: config.REALTIME_MODEL,
        voice: config.REALTIME_VOICE,
        transcriptionModel: config.TRANSCRIPTION_MODEL,
        turnDetection: config.REALTIME_TURN_DETECTION,
        reasoningEffort: config.REALTIME_REASONING_EFFORT,
        log: (type, detail) => app.log.debug({ event: type, detail }, type),
      }),
    analyzer,
    maxCallSeconds: config.MAX_CALL_SECONDS,
    introDelayMs: config.INTRO_DELAY_MS,
    log: logCallEvent,
  }),
  {
    allowedDestinations: config.allowedDestinations,
    maxCallsPerHour: config.MAX_CALLS_PER_HOUR,
    maxConcurrentCalls: 1,
  },
);

registerApiRoutes(app, { config, manager, store });
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
if (!config.APP_PASSWORD) app.log.warn('APP_PASSWORD is not set: anyone who can reach this server can place calls. Set it before exposing the server.');
if (!config.allowedDestinations) app.log.warn('ALLOWED_DESTINATIONS is not set: any valid number can be called. Set it while testing.');
