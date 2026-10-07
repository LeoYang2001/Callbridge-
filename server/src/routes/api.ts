import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CallRecord, CallRequest, PublicConfig } from '../../../shared/types';
import { REALTIME_VOICES, WEEKDAYS } from '../../../shared/types';
import { checkRequest, type CheckDeps } from '../agent/intake';
import { CallRejectedError, type CallManager } from '../calls/callManager';
import type { CallStore } from '../calls/store';
import type { AppConfig } from '../config';
import { isValidDate, isValidTime } from '../policy/availability';
import { isValidTimeZone } from '../util/time';

const text = (max: number) => z.string().trim().max(max);

const CallRequestSchema = z
  .object({
    to: text(32).min(1),
    voice: z.enum(REALTIME_VOICES).optional(),
    counterpartName: text(120).optional(),
    taskInUserLanguage: text(500).optional(),
    user: z.object({
      name: text(80).min(1, 'Name is required'),
      pronouns: text(40).optional(),
      preferredLanguage: text(60).min(1),
    }),
    callLanguage: text(60).min(1).default('English'),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    authorizedInfo: z.array(z.object({ label: text(60), value: text(300) })).max(20).default([]),
    instructions: text(2000).min(10, 'Describe the task in a sentence or two'),
    constraints: z.object({
      availability: z
        .array(
          z
            .object({
              days: z.array(z.enum(WEEKDAYS)).min(1),
              start: z.string().refine(isValidTime, 'HH:MM'),
              end: z.string().refine(isValidTime, 'HH:MM'),
            })
            .refine((w) => w.start < w.end, 'Window end must be after start'),
        )
        .max(10)
        .default([]),
      earliestDate: z.string().refine(isValidDate, 'YYYY-MM-DD').optional().or(z.literal('').transform(() => undefined)),
      latestDate: z.string().refine(isValidDate, 'YYYY-MM-DD').optional().or(z.literal('').transform(() => undefined)),
      maxAdditionalCostUsd: z.number().min(0).max(10_000).default(0),
    }),
  })
  .transform((r) => ({ ...r, authorizedInfo: r.authorizedInfo.filter((f) => f.label && f.value) }));

export function registerApiRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; manager: CallManager; store: CallStore; checkDeps: CheckDeps },
) {
  const { config, manager, store, checkDeps } = deps;

  app.get('/api/health', async () => ({ ok: true, activeCalls: manager.activeCount }));

  app.get('/api/config', async (): Promise<PublicConfig> => ({
    telephonyConfigured: config.telephonyConfigured,
    voiceConfigured: config.voiceConfigured,
    allowlistActive: Boolean(config.allowedDestinations),
    realtimeModel: config.REALTIME_MODEL,
    defaultVoice: config.REALTIME_VOICE,
  }));

  app.post('/api/calls', async (req, reply) => {
    if (!config.telephonyConfigured || !config.voiceConfigured) {
      return reply.code(503).send({ error: 'Server is missing Twilio/OpenAI configuration. See README → Setup.' });
    }
    const parsed = CallRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '),
      });
    }
    // Every call, typed or from the voice intake, passes the same ground rules. The category
    // is set here from the server's own review; the client can't supply it.
    const request = parsed.data as CallRequest;
    const check = await checkRequest(request, checkDeps);
    if (!check.ok) {
      const reasons = [...check.missing.map((m) => `Missing: ${m}.`), ...check.problems];
      const translated = check.review?.tier === 'refused' ? check.review.reasonInUserLanguage : '';
      return reply.code(422).send({ error: [...reasons, translated].filter(Boolean).join(' '), review: check.review });
    }
    try {
      const record = manager.startCall({ ...request, category: check.review!.category });
      return reply.code(201).send(record);
    } catch (err) {
      if (err instanceof CallRejectedError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get('/api/calls', async () =>
    store.list().map((r) => ({ id: r.id, createdAt: r.createdAt, status: r.status, to: r.request.to, success: r.result?.success })),
  );

  app.get<{ Params: { id: string } }>('/api/calls/:id', async (req, reply) => {
    const r = store.get(req.params.id);
    if (!r) return reply.code(404).send({ error: 'Not found' });
    return r;
  });

  /** Server-sent events: the full call record on every change. */
  app.get<{ Params: { id: string } }>('/api/calls/:id/stream', (req, reply) => {
    const r = store.get(req.params.id);
    if (!r) return reply.code(404).send({ error: 'Not found' });

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let pending: NodeJS.Timeout | null = null;
    const send = (rec: CallRecord) => res.write(`data: ${JSON.stringify(rec)}\n\n`);
    // Coalesce bursts (audio-rate updates) into at most ~10 messages per second.
    const unsubscribe = store.subscribe(r.id, (rec) => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        send(rec);
      }, 100);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    send(r);

    req.raw.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
    });
  });
}
