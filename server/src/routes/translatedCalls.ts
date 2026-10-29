import type { FastifyInstance, FastifyRequest } from 'fastify';
import twilio from 'twilio';
import { z } from 'zod';
import { CallRejectedError } from '../calls/callManager';
import type { TranslatedCallManager } from '../calls/translatedCallManager';
import type { AppConfig } from '../config';

const StartSchema = z.object({
  to: z.string().trim().min(3).max(32),
  contactName: z.string().trim().max(80).optional(),
  theirLanguage: z.string().trim().min(2).max(40),
  join: z.enum(['app', 'phone']),
  captions: z.boolean().optional(),
});

/**
 * Translated calls: the user calls someone themselves; captions translate both sides, and an AI
 * interpreter can join to speak the translations.
 */
export function registerTranslatedCallRoutes(app: FastifyInstance, deps: { config: AppConfig; manager: TranslatedCallManager }) {
  const { config, manager } = deps;

  /** Starts the call. Joining from the app returns a Twilio Voice token and the leg's one-time code. */
  app.post('/api/translated-calls', async (req, reply) => {
    if (!config.telephonyConfigured || !config.voiceConfigured) {
      return reply.code(503).send({ error: 'Server is missing Twilio/OpenAI configuration. See README → Setup.' });
    }
    const parsed = StartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const user = req.user!;
    const p = user.profile;
    let voiceToken: string | undefined;
    if (parsed.data.join === 'app') {
      const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = config;
      if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_TWIML_APP_SID) {
        return reply.code(503).send({ error: "Calling from the app isn't set up on the server. Choose \"Ring my phone\"." });
      }
      const token = new twilio.jwt.AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { identity: user.id, ttl: 600 });
      token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: TWILIO_TWIML_APP_SID, incomingAllow: false }));
      voiceToken = token.toJwt();
    }
    try {
      const ownNumber = Boolean(p.callerIdVerifiedAt) && p.useOwnCallerId !== false;
      const { record, code } = await manager.start(parsed.data, {
        userId: user.id,
        name: p.name,
        language: p.preferredLanguage,
        phone: user.phone,
        callerId: ownNumber ? user.phone : undefined,
      });
      return reply.code(201).send({ record, ...(voiceToken && code ? { join: { token: voiceToken, callId: record.id, code } } : {}) });
    } catch (err) {
      if (err instanceof CallRejectedError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  const ownLive = (req: FastifyRequest<{ Params: { id: string } }>) => manager.live(req.params.id, req.user!.id);

  app.get<{ Params: { id: string } }>('/api/translated-calls/:id', async (req, reply) => {
    const record = manager.get(req.params.id, req.user!.id);
    return record ?? reply.code(404).send({ error: 'Not found' });
  });

  app.post<{ Params: { id: string } }>('/api/translated-calls/:id/captions', async (req, reply) => {
    const call = ownLive(req);
    if (!call) return reply.code(404).send({ error: 'That call is not in progress.' });
    const parsed = z.object({ on: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Send { on: true | false }.' });
    const failed = call.setCaptions(parsed.data.on);
    return failed ? reply.code(409).send({ error: failed }) : { ok: true };
  });

  /** Adds the interpreter (once the other side agreed) or removes it. */
  app.post<{ Params: { id: string } }>('/api/translated-calls/:id/interpreter', async (req, reply) => {
    const call = ownLive(req);
    if (!call) return reply.code(404).send({ error: 'That call is not in progress.' });
    const parsed = z.object({ on: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Send { on: true | false }.' });
    const failed = await call.setInterpreter(parsed.data.on);
    return failed ? reply.code(409).send({ error: failed }) : { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/translated-calls/:id/hangup', async (req, reply) => {
    const call = ownLive(req);
    if (!call) return reply.code(404).send({ error: 'That call is not in progress.' });
    call.endByUser();
    return reply.code(202).send({ ok: true });
  });
}
