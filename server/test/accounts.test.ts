import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AuthResult, Me, TranslatedCallRecord } from '../../shared/types';
import { LogOtp, OtpRateLimit } from '../src/auth/otp';
import { Database } from '../src/db/database';
import { emptyProfile, learnFromCall } from '../src/profile/profile';
import { registerAuthRoutes } from '../src/routes/auth';

const ME = '+19014553148';

/** A finished translated call to the dentist. */
const finishedCall = (id: string, overrides: Partial<TranslatedCallRecord['request']> = {}, answered = true): TranslatedCallRecord => ({
  id,
  request: { to: '+14155550123', contactName: 'Smile Dental', theirLanguage: 'English', join: 'phone', ...overrides },
  userLanguage: 'Chinese (Mandarin)',
  status: answered ? 'ended' : 'failed',
  createdAt: 1000,
  ...(answered ? { answeredAt: 1500 } : {}),
  endedAt: 90_000,
  captions: true,
  interpreter: 'off',
  lines: [],
});

function app(opts: { signupAllowlist?: string[] | null } = {}) {
  const db = new Database(':memory:');
  const codes = new Map<string, string>();
  const otp = new LogOtp((m) => {
    const [, phone, code] = m.match(/for (\+\d+): (\d{6})/)!;
    codes.set(phone!, code!);
  });
  const server = Fastify();
  // Same gate as index.ts.
  server.addHook('onRequest', async (req, reply) => {
    if (['/api/auth/start', '/api/auth/verify'].includes(req.url)) return;
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const user = token ? db.userForToken(token) : undefined;
    if (!user) return reply.code(401).send({ error: 'Sign in to continue.' });
    req.user = user;
    req.sessionToken = token;
  });
  registerAuthRoutes(server, { db, otp, perPhone: new OtpRateLimit(3), perAddress: new OtpRateLimit(50), signupAllowlist: opts.signupAllowlist ?? null });
  const signIn = async (phone = '(901) 455-3148') => {
    expect((await server.inject({ method: 'POST', url: '/api/auth/start', payload: { phone } })).statusCode).toBe(200);
    const res = await server.inject({ method: 'POST', url: '/api/auth/verify', payload: { phone, code: codes.get(ME), language: 'Chinese (Mandarin)', timezone: 'America/Chicago' } });
    return { status: res.statusCode, body: res.json() as AuthResult };
  };
  return { db, server, codes, signIn };
}

describe('phone sign-in', () => {
  it('creates the account on first sign-in, then signs the same user in again', async () => {
    const { server, signIn } = app();
    const first = await signIn();
    expect(first.status).toBe(200);
    expect(first.body.isNew).toBe(true);
    expect(first.body.me).toMatchObject({ phone: ME, profile: { preferredLanguage: 'Chinese (Mandarin)', onboarded: false } });

    const me = await server.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${first.body.token}` } });
    expect((me.json() as Me).id).toBe(first.body.me.id);

    const again = await signIn();
    expect(again.body.isNew).toBe(false);
    expect(again.body.me.id).toBe(first.body.me.id);

    await server.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${first.body.token}` } });
    expect((await server.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${first.body.token}` } })).statusCode).toBe(401);
  });

  it('rejects a wrong code and locks the code after too many tries', async () => {
    const { server, codes } = app();
    await server.inject({ method: 'POST', url: '/api/auth/start', payload: { phone: ME } });
    for (let i = 0; i < 5; i++) {
      expect((await server.inject({ method: 'POST', url: '/api/auth/verify', payload: { phone: ME, code: '000000' } })).statusCode).toBe(401);
    }
    expect((await server.inject({ method: 'POST', url: '/api/auth/verify', payload: { phone: ME, code: codes.get(ME) } })).statusCode).toBe(401);
  });

  it('is invite-only when a signup list is set, and rate-limits codes', async () => {
    const { server } = app({ signupAllowlist: [ME] });
    expect((await server.inject({ method: 'POST', url: '/api/auth/start', payload: { phone: '+14155550123' } })).statusCode).toBe(403);
    for (let i = 0; i < 3; i++) expect((await server.inject({ method: 'POST', url: '/api/auth/start', payload: { phone: ME } })).statusCode).toBe(200);
    expect((await server.inject({ method: 'POST', url: '/api/auth/start', payload: { phone: ME } })).statusCode).toBe(429);
  });

  it('saves profile edits', async () => {
    const { server, signIn } = app();
    const { body } = await signIn();
    const auth = { authorization: `Bearer ${body.token}` };
    const ok = await server.inject({ method: 'PATCH', url: '/api/me/profile', headers: auth, payload: { name: 'Leo', defaultCallLanguage: 'English', onboarded: true } });
    expect((ok.json() as Me).profile).toMatchObject({ name: 'Leo', defaultCallLanguage: 'English', onboarded: true });
    expect((await server.inject({ method: 'PATCH', url: '/api/me/profile', headers: auth, payload: { timezone: 'Mars/Olympus' } })).statusCode).toBe(400);
  });

  it('deletes the account and its call history', async () => {
    const { server, db, signIn } = app();
    const { body } = await signIn();
    db.saveCall({ ...finishedCall('tc_one'), userId: body.me.id });
    expect(db.callsForUser(body.me.id)).toHaveLength(1);
    await server.inject({ method: 'DELETE', url: '/api/me', headers: { authorization: `Bearer ${body.token}` } });
    expect(db.userById(body.me.id)).toBeUndefined();
    expect(db.callsForUser(body.me.id)).toHaveLength(0);
  });

  it("deletes one call from the user's history, and only their own", async () => {
    const { db, signIn } = app();
    const { body } = await signIn();
    const id = 'tc_two';
    db.saveCall({ ...finishedCall(id), userId: body.me.id });
    expect(db.deleteCall('someone-else', id)).toBe(false);
    expect(db.call(id)).toBeDefined();
    expect(db.deleteCall(body.me.id, id)).toBe(true);
    expect(db.call(id)).toBeUndefined();
  });
});

describe('learning from calls', () => {
  it('adds a named number that connected, and updates the same contact on the next call', () => {
    const once = learnFromCall(emptyProfile(), finishedCall('a'));
    expect(once.contacts).toMatchObject([{ name: 'Smile Dental', phone: '+14155550123', language: 'English', callCount: 1, lastCalledAt: 1000 }]);
    const twice = learnFromCall(once, { ...finishedCall('b', { theirLanguage: 'Spanish' }), createdAt: 2000 });
    expect(twice.contacts).toHaveLength(1);
    expect(twice.contacts[0]).toMatchObject({ callCount: 2, language: 'Spanish', lastCalledAt: 2000 });
  });

  it("doesn't add a number nobody answered, or one without a name", () => {
    expect(learnFromCall(emptyProfile(), finishedCall('c', {}, false)).contacts).toEqual([]);
    expect(learnFromCall(emptyProfile(), finishedCall('d', { contactName: undefined })).contacts).toEqual([]);
  });

  it("keeps the user's name for a contact", () => {
    const profile = { ...emptyProfile(), contacts: [{ id: 'm', name: 'Maria', phone: '+14155550123', notes: [], callCount: 1 }] };
    expect(learnFromCall(profile, finishedCall('e', { contactName: 'someone else', theirLanguage: 'Tagalog' })).contacts).toMatchObject([{ id: 'm', name: 'Maria', language: 'Tagalog', callCount: 2 }]);
  });
});

describe('phone book', () => {
  it('adds, edits, and deletes contacts; rejects bad numbers and duplicates', async () => {
    const { server, signIn } = app();
    const { body } = await signIn();
    const auth = { authorization: `Bearer ${body.token}` };
    const add = await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'Maria', phone: '747-283-6440', relationship: 'girlfriend', language: 'Tagalog' } });
    const maria = (add.json() as Me).profile.contacts[0]!;
    expect(maria).toMatchObject({ name: 'Maria', phone: '+17472836440', relationship: 'girlfriend', language: 'Tagalog' });

    expect((await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'Dup', phone: '+1 (747) 283-6440' } })).statusCode).toBe(422);
    expect((await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'Bad', phone: '911' } })).statusCode).toBe(422);

    const edited = await server.inject({ method: 'PATCH', url: `/api/me/contacts/${maria.id}`, headers: auth, payload: { name: 'Maria Santos', phone: '7472836440', relationship: 'girlfriend' } });
    const after = (edited.json() as Me).profile.contacts[0]!;
    expect(after).toMatchObject({ id: maria.id, name: 'Maria Santos' });
    expect(after.language).toBeUndefined(); // cleared by the edit

    const del = await server.inject({ method: 'DELETE', url: `/api/me/contacts/${maria.id}`, headers: auth });
    expect((del.json() as Me).profile.contacts).toHaveLength(0);
  });
});
