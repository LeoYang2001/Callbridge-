import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CallManager } from '../calls/callManager';
import type { CallStore } from '../calls/store';

const TICKET_TTL_MS = 60_000;

/**
 * Listening to a call live. Browsers can't send an Authorization header on a WebSocket, so the
 * signed-in app first gets a one-time ticket (POST /api/calls/:id/listen, normal sign-in), then
 * opens /listen/:id?ticket=… with it. Listen-only: nothing the app sends reaches the call.
 */
export function registerListenRoutes(app: FastifyInstance, deps: { manager: CallManager; store: CallStore }) {
  const { manager, store } = deps;
  const tickets = new Map<string, { callId: string; expires: number }>();

  app.post<{ Params: { id: string } }>('/api/calls/:id/listen', async (req, reply) => {
    const call = store.get(req.params.id);
    if (!call || call.userId !== req.user?.id) return reply.code(404).send({ error: 'Not found' });
    for (const [t, v] of tickets) if (v.expires < Date.now()) tickets.delete(t);
    const ticket = randomBytes(24).toString('base64url');
    tickets.set(ticket, { callId: call.id, expires: Date.now() + TICKET_TTL_MS });
    return { ticket };
  });

  app.get<{ Params: { id: string }; Querystring: { ticket?: string } }>('/listen/:id', { websocket: true }, (socket, req: FastifyRequest<{ Params: { id: string }; Querystring: { ticket?: string } }>) => {
    const entry = req.query.ticket ? tickets.get(req.query.ticket) : undefined;
    if (req.query.ticket) tickets.delete(req.query.ticket); // one use
    if (!entry || entry.callId !== req.params.id || entry.expires < Date.now()) {
      socket.close(4401, 'Not allowed');
      return;
    }
    const stop = manager.listen(req.params.id, (event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
      if (event.t === 'end') socket.close(1000, 'Call ended');
    });
    if (!stop) {
      socket.close(4404, 'Call is not in progress');
      return;
    }
    socket.on('close', stop);
  });
}
