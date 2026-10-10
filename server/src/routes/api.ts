import twilio from 'twilio';
import { readFile } from 'node:fs/promises';
import { recordingPath, removeRecording } from '../calls/recordings';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CallRecord, CallRequest, CallSummary, PublicConfig, TaskReview } from '../../../shared/types';
import { checkRequest, type CheckDeps } from '../agent/intake';
import { CallRejectedError, type CallManager } from '../calls/callManager';
import { CallRequestSchema } from '../calls/requestSchema';
import type { CallStore } from '../calls/store';
import type { AppConfig } from '../config';
import type { Database } from '../db/database';

export function registerApiRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; manager: CallManager; store: CallStore; checkDeps: CheckDeps; db: Database; recordingsDir?: string | null },
) {
  const { config, manager, store, checkDeps, db, recordingsDir } = deps;
  /** A call the signed-in user placed; other users' calls look like they don't exist. */
  const ownCall = (req: FastifyRequest, id: string) => {
    const r = store.getOrLoad(id);
    return r && r.userId === req.user?.id ? r : undefined;
  };

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
    const checked = await validateCallRequest(req.body, checkDeps);
    if ('error' in checked) return reply.code(checked.status).send({ error: checked.error, review: checked.review });
    try {
      // Recorded unless the user turned it off (UserProfile.recordCalls).
      const record = manager.startCall({ ...checked.request, record: req.user!.profile.recordCalls !== false }, req.user!.id);
      return reply.code(201).send(record);
    } catch (err) {
      if (err instanceof CallRejectedError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post<{ Params: { id: string; qid: string } }>('/api/calls/:id/questions/:qid', async (req, reply) => {
    if (!ownCall(req, req.params.id)) return reply.code(404).send({ error: 'Not found' });
    const parsed = z
      .object({ decision: z.enum(['approve', 'decline', 'reply', 'later']), text: z.string().trim().max(300).optional() })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Send decision approve, decline, later, or reply (with text).' });
    const failed = manager.answerQuestion(req.params.id, req.params.qid, parsed.data);
    if (failed) return reply.code(failed.status).send({ error: failed.error });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/calls/:id/messages', async (req, reply) => {
    if (!ownCall(req, req.params.id)) return reply.code(404).send({ error: 'Not found' });
    const parsed = z.object({ text: z.string().trim().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a message first.' });
    const failed = manager.sendUserMessage(req.params.id, parsed.data.text);
    if (failed) return reply.code(failed.status).send({ error: failed.error });
    return { ok: true };
  });

  /** Take-over: ring the user's phone into the call; the assistant goes quiet once they answer. */
  app.post<{ Params: { id: string } }>('/api/calls/:id/takeover', async (req, reply) => {
    if (!ownCall(req, req.params.id)) return reply.code(404).send({ error: 'Not found' });
    const failed = await manager.takeOver(req.params.id, req.user!.phone);
    if (failed) return reply.code(failed.status).send({ error: failed.error });
    return reply.code(202).send({ ok: true });
  });

  /**
   * Join from the app: starts the take-over and returns a short-lived Twilio Voice token (the app
   * dials our TwiML App with it) and the one-time code its leg presents to /twilio/client-voice.
   */
  app.post<{ Params: { id: string } }>('/api/calls/:id/join', async (req, reply) => {
    if (!ownCall(req, req.params.id)) return reply.code(404).send({ error: 'Not found' });
    const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = config;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_TWIML_APP_SID) {
      return reply.code(503).send({ error: "Joining from the app isn't set up on the server." });
    }
    const started = manager.startAppJoin(req.params.id, req.user!.phone);
    if ('error' in started) return reply.code(started.status).send({ error: started.error });
    const token = new twilio.jwt.AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { identity: req.user!.id, ttl: 600 });
    token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: TWILIO_TWIML_APP_SID, incomingAllow: false }));
    return { token: token.toJwt(), callId: req.params.id, code: started.code };
  });

  /** Take-over: hand the call back to the assistant (also happens when the user hangs up). */
  app.post<{ Params: { id: string } }>('/api/calls/:id/handback', async (req, reply) => {
    if (!ownCall(req, req.params.id)) return reply.code(404).send({ error: 'Not found' });
    if (!manager.handBack(req.params.id)) return reply.code(404).send({ error: 'That call is not in progress.' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/calls/:id/hangup', async (req, reply) => {
    if (!ownCall(req, req.params.id)) return reply.code(404).send({ error: 'Not found' });
    if (!manager.endCall(req.params.id)) return reply.code(404).send({ error: 'That call is not in progress.' });
    return reply.code(202).send({ ok: true });
  });

  /** The signed-in user's calls, newest first: live ones from memory, finished ones from the database. */
  app.get('/api/calls', async (req): Promise<CallSummary[]> => {
    const live = store.list().filter((r) => r.userId === req.user!.id);
    const saved = db.callsForUser(req.user!.id).filter((r) => !live.some((l) => l.id === r.id));
    return [...live, ...saved].map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      to: r.request.to,
      counterpartName: r.request.counterpartName,
      headline: r.result?.headlineInUserLanguage,
      success: r.result?.success,
    }));
  });

  app.get<{ Params: { id: string } }>('/api/calls/:id', async (req, reply) => {
    const r = ownCall(req, req.params.id);
    if (!r) return reply.code(404).send({ error: 'Not found' });
    return manager.liveView(r);
  });

  /** Deletes a finished call from the user's history (swiped away in the app). */
  app.delete<{ Params: { id: string } }>('/api/calls/:id', async (req, reply) => {
    const r = ownCall(req, req.params.id);
    if (!r) return reply.code(404).send({ error: 'Not found' });
    if (manager.isLive(r.id)) return reply.code(409).send({ error: 'That call is still going. End it first.' });
    db.deleteCall(req.user!.id, r.id);
    store.forget(r.id);
    await removeRecording(recordingsDir, r.id);
    return { ok: true };
  });

  /** The call's recording (WAV), for replay with the transcript. */
  app.get<{ Params: { id: string } }>('/api/calls/:id/recording', async (req, reply) => {
    const r = ownCall(req, req.params.id);
    if (!r || !r.recording || !recordingsDir) return reply.code(404).send({ error: 'No recording for this call.' });
    const audio = await readFile(recordingPath(recordingsDir, r.id)).catch(() => null);
    if (!audio) return reply.code(404).send({ error: 'No recording for this call.' });
    return reply.header('Content-Type', 'audio/wav').header('Cache-Control', 'private, max-age=3600').send(audio);
  });

  /** Server-sent events: the full call record on every change. */
  app.get<{ Params: { id: string } }>('/api/calls/:id/stream', (req, reply) => {
    const r = ownCall(req, req.params.id) && store.get(req.params.id);
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
    const send = (rec: CallRecord) => res.write(`data: ${JSON.stringify(manager.liveView(rec))}\n\n`);
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

/**
 * Every call, typed, from the voice intake, or queued as an errand, passes the same ground rules.
 * The category is set here from the server's own review; the client can't supply it.
 */
export async function validateCallRequest(
  body: unknown,
  checkDeps: CheckDeps,
): Promise<{ request: CallRequest } | { status: number; error: string; review?: TaskReview | null }> {
  const parsed = CallRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ') };
  }
  const request = parsed.data as CallRequest;
  const check = await checkRequest(request, checkDeps);
  if (!check.ok) {
    const reasons = [...check.missing.map((m) => `Missing: ${m}.`), ...check.problems];
    const translated = check.review?.tier === 'refused' ? check.review.reasonInUserLanguage : '';
    return { status: 422, error: [...reasons, translated].filter(Boolean).join(' '), review: check.review };
  }
  return { request: { ...request, category: check.review!.category } };
}

