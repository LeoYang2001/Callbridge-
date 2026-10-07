import type { FastifyInstance } from 'fastify';
import type { CallManager } from '../calls/callManager';
import type { AppConfig } from '../config';
import { mapTwilioStatus, TwilioMediaTransport, TwilioTelephony } from '../providers/telephony/twilio';

export function registerTwilioRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; manager: CallManager; telephony: TwilioTelephony },
) {
  const { config, manager, telephony } = deps;

  const signatureOk = (path: string, sig: string | string[] | undefined, body: Record<string, unknown> | undefined) =>
    !config.TWILIO_VALIDATE_SIGNATURES ||
    telephony.validateSignature(typeof sig === 'string' ? sig : undefined, `${config.PUBLIC_BASE_URL}${path}`, body ?? {});

  /** Call progress webhooks (initiated / ringing / answered / completed). */
  app.post<{ Querystring: { callId?: string }; Body: Record<string, string> }>('/twilio/status', async (req, reply) => {
    if (!signatureOk(req.url, req.headers['x-twilio-signature'], req.body)) {
      req.log.warn('Rejected Twilio webhook with invalid signature');
      return reply.code(403).send('invalid signature');
    }
    const callId = req.query.callId;
    const state = mapTwilioStatus(req.body?.CallStatus ?? '');
    if (callId && state) manager.handleTelephonyState(callId, state);
    return reply.code(204).send();
  });

  /** TwiML for calls placed with a TwiML URL instead of inline TwiML (trial-account fallback). */
  app.post<{ Querystring: { callId?: string }; Body: Record<string, string> }>('/twilio/twiml', async (req, reply) => {
    if (!signatureOk(req.url, req.headers['x-twilio-signature'], req.body)) {
      req.log.warn('Rejected Twilio TwiML request with invalid signature');
      return reply.code(403).send('invalid signature');
    }
    const callId = req.query.callId ?? '';
    const token = manager.streamTokenFor(callId);
    const twiml = token
      ? TwilioTelephony.streamTwiml(config.PUBLIC_BASE_URL!, callId, token)
      : '<Response><Hangup/></Response>';
    return reply.type('text/xml').send(twiml);
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
