import type { FastifyInstance } from 'fastify';
import type { CallManager } from '../calls/callManager';
import type { AppConfig } from '../config';
import { mapTwilioStatus, TwilioMediaTransport, type TwilioTelephony } from '../providers/telephony/twilio';

export function registerTwilioRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; manager: CallManager; telephony: TwilioTelephony },
) {
  const { config, manager, telephony } = deps;

  /** Call progress webhooks (initiated / ringing / answered / completed). */
  app.post<{ Querystring: { callId?: string }; Body: Record<string, string> }>('/twilio/status', async (req, reply) => {
    if (config.TWILIO_VALIDATE_SIGNATURES) {
      const url = `${config.PUBLIC_BASE_URL}${req.url}`;
      const sig = req.headers['x-twilio-signature'];
      if (!telephony.validateSignature(typeof sig === 'string' ? sig : undefined, url, req.body ?? {})) {
        req.log.warn({ url }, 'Rejected Twilio webhook with invalid signature');
        return reply.code(403).send('invalid signature');
      }
    }
    const callId = req.query.callId;
    const state = mapTwilioStatus(req.body?.CallStatus ?? '');
    if (callId && state) manager.handleTelephonyState(callId, state);
    return reply.code(204).send();
  });

  /** Bidirectional media stream opened by <Connect><Stream>. */
  app.get('/twilio/media', { websocket: true }, (socket, req) => {
    const transport = new TwilioMediaTransport(socket);
    transport
      .waitForStart()
      .then((start) => {
        const { callId = '', token = '' } = start.customParameters ?? {};
        if (!manager.attachMedia(callId, token, transport)) {
          req.log.warn({ callId }, 'Media stream rejected: unknown call or bad token');
          transport.close();
        }
      })
      .catch((err) => {
        req.log.warn({ err: (err as Error).message }, 'Media stream never started');
        transport.close();
      });
  });
}
