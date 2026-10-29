import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PublicConfig } from '../../../shared/types';
import type { TranslatedCallManager } from '../calls/translatedCallManager';
import type { AppConfig } from '../config';
import type { Database } from '../db/database';
import type { TelephonyProvider } from '../providers/telephony/types';

export function registerApiRoutes(app: FastifyInstance, deps: { config: AppConfig; manager: TranslatedCallManager; db: Database; telephony?: TelephonyProvider | null }) {
  const { config, manager, db, telephony } = deps;

  app.get('/api/health', async () => ({ ok: true, activeCalls: manager.activeCount }));

  app.get('/api/config', async (): Promise<PublicConfig> => ({
    telephonyConfigured: config.telephonyConfigured,
    voiceConfigured: config.voiceConfigured,
    allowlistActive: Boolean(config.allowedDestinations),
    inAppCalling: config.inAppCalling,
  }));

  /**
   * Calls from the user's own number: verifying it starts with Twilio calling them, and the code
   * shown in the app goes on the keypad. GET checks (and records) whether it's verified.
   */
  app.post('/api/me/caller-id', async (req, reply) => {
    if (!telephony?.startCallerIdVerification || !telephony.isVerifiedCallerId) return reply.code(503).send({ error: "Calling from your own number isn't available." });
    const user = req.user!;
    if (await telephony.isVerifiedCallerId(user.phone)) return markVerified(user);
    try {
      const { validationCode } = await telephony.startCallerIdVerification(user.phone, `CallBridge · ${user.profile.name || user.phone}`);
      return { verified: false, validationCode };
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'caller id verification failed');
      return reply.code(502).send({ error: "Couldn't start the verification call. Try again in a minute." });
    }
  });

  app.get('/api/me/caller-id', async (req, reply) => {
    if (!telephony?.isVerifiedCallerId) return reply.code(503).send({ error: "Calling from your own number isn't available." });
    const user = req.user!;
    if (await telephony.isVerifiedCallerId(user.phone)) return markVerified(user);
    return { verified: false, enabled: false };
  });

  /** Verified: remembered on the profile (server-set), and switched on the first time. */
  const markVerified = (user: NonNullable<FastifyRequest['user']>) => {
    if (!user.profile.callerIdVerifiedAt) {
      user.profile = { ...user.profile, callerIdVerifiedAt: Date.now(), useOwnCallerId: user.profile.useOwnCallerId ?? true };
      db.saveProfile(user.id, user.profile);
    }
    return { verified: true, enabled: user.profile.useOwnCallerId !== false };
  };
}
