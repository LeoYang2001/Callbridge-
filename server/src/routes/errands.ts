import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CheckDeps } from '../agent/intake';
import type { CallManager } from '../calls/callManager';
import type { AppConfig } from '../config';
import type { ErrandQueue } from '../errands/errandQueue';
import { validateCallRequest } from './api';

/** The errand queue: calls the server places later, on its own, one at a time. */
export function registerErrandRoutes(app: FastifyInstance, deps: { config: AppConfig; queue: ErrandQueue; manager: Pick<CallManager, 'endCall'>; checkDeps: CheckDeps }) {
  const { config, queue, manager, checkDeps } = deps;

  /** Body: { request: CallRequest, notBefore?: ms since epoch }. Checked now, and again when dialed. */
  app.post('/api/errands', async (req, reply) => {
    if (!config.telephonyConfigured || !config.voiceConfigured) {
      return reply.code(503).send({ error: 'Server is missing Twilio/OpenAI configuration. See README → Setup.' });
    }
    const body = z.object({ request: z.unknown(), notBefore: z.number().int().positive().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Send { request, notBefore? }.' });
    if (body.data.notBefore && body.data.notBefore > Date.now() + 14 * 86_400_000) {
      return reply.code(400).send({ error: 'Errands can be scheduled up to two weeks ahead.' });
    }
    const checked = await validateCallRequest(body.data.request, checkDeps);
    if ('error' in checked) return reply.code(checked.status).send({ error: checked.error, review: checked.review });
    return reply.code(201).send(queue.add(req.user!.id, checked.request, body.data.notBefore));
  });

  app.get('/api/errands', async (req) => queue.list(req.user!.id));

  app.post<{ Params: { id: string } }>('/api/errands/:id/cancel', async (req, reply) => {
    const canceled = queue.cancel(req.user!.id, req.params.id);
    if (!canceled) return reply.code(404).send({ error: 'That errand is not waiting or calling.' });
    if (canceled.hangUp) manager.endCall(canceled.hangUp);
    return canceled.errand;
  });

  app.post<{ Params: { id: string } }>('/api/errands/:id/retry', async (req, reply) => {
    const errand = queue.retry(req.user!.id, req.params.id);
    if (!errand) return reply.code(404).send({ error: 'That errand is still in the queue.' });
    return errand;
  });
}
