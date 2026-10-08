import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthResult, Me } from '../../../shared/types';
import type { OtpRateLimit, OtpSender } from '../auth/otp';
import type { Database, UserRow } from '../db/database';
import { isExpoPushToken } from '../push/push';
import { applyProfilePatch, ContactInputSchema, emptyProfile, ProfilePatchSchema, saveContact } from '../profile/profile';
import { blockedReason, normalizePhone } from '../util/phone';
import { isValidTimeZone } from '../util/time';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user (set by the auth hook for every /api route except sign-in). */
    user?: UserRow;
    sessionToken?: string;
  }
}

export const toMe = (u: UserRow): Me => ({ id: u.id, phone: u.phone, profile: u.profile });

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: {
    db: Database;
    otp: OtpSender;
    perPhone: OtpRateLimit;
    perAddress: OtpRateLimit;
    /** When set, only these numbers can create an account (existing users can always sign in). */
    signupAllowlist: string[] | null;
  },
) {
  const { db, otp, perPhone, perAddress, signupAllowlist } = deps;

  /** Sends a sign-in code by SMS (or to the server log in test mode). */
  app.post('/api/auth/start', async (req, reply) => {
    const parsed = z.object({ phone: z.string().max(32) }).safeParse(req.body);
    const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
    if (!phone || blockedReason(phone)) return reply.code(400).send({ error: 'Enter a valid mobile number.' });
    if (!db.userByPhone(phone) && signupAllowlist && !signupAllowlist.includes(phone)) {
      return reply.code(403).send({ error: 'CallBridge is invite-only for now, and this number is not on the list.' });
    }
    if (!perAddress.allow(req.ip) || !perPhone.allow(phone)) {
      return reply.code(429).send({ error: 'Too many codes requested. Try again in an hour.' });
    }
    try {
      await otp.send(phone);
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'auth.send_failed');
      return reply.code(502).send({ error: "Couldn't send the code. Check the number and try again." });
    }
    return { ok: true, channel: otp.channel };
  });

  /** Checks the code; signs in, creating the account on first sign-in. */
  app.post('/api/auth/verify', async (req, reply): Promise<AuthResult | undefined> => {
    const parsed = z
      .object({
        phone: z.string().max(32),
        code: z.string().trim().regex(/^\d{4,8}$/),
        language: z.string().trim().max(60).optional(),
        timezone: z.string().refine(isValidTimeZone).optional(),
      })
      .safeParse(req.body);
    const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
    if (!parsed.success || !phone) return reply.code(400).send({ error: 'Enter the code from the text message.' });
    if (!(await otp.check(phone, parsed.data.code))) return reply.code(401).send({ error: "That code didn't work. Check it, or send a new one." });

    let user = db.userByPhone(phone);
    const isNew = !user;
    if (!user) {
      if (signupAllowlist && !signupAllowlist.includes(phone)) return reply.code(403).send({ error: 'CallBridge is invite-only for now.' });
      user = db.createUser(phone, {
        ...emptyProfile(),
        preferredLanguage: parsed.data.language || 'English',
        timezone: parsed.data.timezone || 'America/Chicago',
      });
    }
    return { token: db.createSession(user.id), isNew, me: toMe(user) };
  });

  app.post('/api/auth/logout', async (req) => {
    if (req.sessionToken) db.deleteSession(req.sessionToken);
    return { ok: true };
  });

  app.get('/api/me', async (req) => toMe(req.user!));

  app.patch('/api/me/profile', async (req, reply) => {
    const parsed = ProfilePatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const result = applyProfilePatch(req.user!.profile, parsed.data);
    if ('error' in result) return reply.code(422).send({ error: result.error });
    db.saveProfile(req.user!.id, result.profile);
    return toMe({ ...req.user!, profile: result.profile });
  });

  // ── phone book ──
  app.post('/api/me/contacts', async (req, reply) => {
    const parsed = ContactInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Check the contact.' });
    const result = saveContact(req.user!.profile, parsed.data);
    if ('error' in result) return reply.code(422).send({ error: result.error });
    db.saveProfile(req.user!.id, result.profile);
    return toMe({ ...req.user!, profile: result.profile });
  });

  app.patch<{ Params: { id: string } }>('/api/me/contacts/:id', async (req, reply) => {
    const parsed = ContactInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Check the contact.' });
    const result = saveContact(req.user!.profile, parsed.data, req.params.id);
    if ('error' in result) return reply.code(422).send({ error: result.error });
    db.saveProfile(req.user!.id, result.profile);
    return toMe({ ...req.user!, profile: result.profile });
  });

  app.delete<{ Params: { id: string } }>('/api/me/contacts/:id', async (req) => {
    const profile = { ...req.user!.profile, contacts: req.user!.profile.contacts.filter((c) => c.id !== req.params.id) };
    db.saveProfile(req.user!.id, profile);
    return toMe({ ...req.user!, profile });
  });

  // ── push notifications ── (the mobile app registers its Expo push token after sign-in)
  const PushTokenSchema = z.object({ token: z.string().max(200), platform: z.enum(['ios', 'android']).default('ios') });
  app.post('/api/me/push-tokens', async (req, reply) => {
    const parsed = PushTokenSchema.safeParse(req.body);
    if (!parsed.success || !isExpoPushToken(parsed.data.token)) return reply.code(400).send({ error: 'Not an Expo push token.' });
    db.addPushToken(req.user!.id, parsed.data.token, parsed.data.platform);
    return { ok: true };
  });

  /** Called before signing out, so this phone stops getting the account's notifications. */
  app.delete('/api/me/push-tokens', async (req, reply) => {
    const parsed = z.object({ token: z.string().max(200) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Missing token.' });
    db.removePushToken(parsed.data.token, req.user!.id);
    return { ok: true };
  });

  /** Deletes the account, its profile, and its call history. */
  app.delete('/api/me', async (req) => {
    db.deleteUser(req.user!.id);
    return { ok: true };
  });
}
