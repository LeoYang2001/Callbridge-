import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AuthResult, Me } from '../../shared/types';
import { LogOtp, OtpRateLimit } from '../src/auth/otp';
import { newCallRecord } from '../src/calls/callSession';
import { Database } from '../src/db/database';
import { emptyProfile, learnFromCall, profileForPrompt } from '../src/profile/profile';
import { registerAuthRoutes } from '../src/routes/auth';
import { dentistRequest } from './fixtures';

const ME = '+19014553148';

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

  it('saves profile edits but never card numbers, SSNs, or passwords', async () => {
    const { server, signIn } = app();
    const { body } = await signIn();
    const auth = { authorization: `Bearer ${body.token}` };
    const ok = await server.inject({ method: 'PATCH', url: '/api/me/profile', headers: auth, payload: { name: 'Leo', shareable: [{ label: 'Date of birth', value: 'March 3, 1990' }], onboarded: true } });
    expect((ok.json() as Me).profile).toMatchObject({ name: 'Leo', onboarded: true, shareable: [{ label: 'Date of birth' }] });
    const bad = await server.inject({ method: 'PATCH', url: '/api/me/profile', headers: auth, payload: { shareable: [{ label: 'SSN', value: '123-45-6789' }] } });
    expect(bad.statusCode).toBe(422);
    expect(((await server.inject({ method: 'GET', url: '/api/me', headers: auth })).json() as Me).profile.shareable).toHaveLength(1);
  });

  it('deletes the account and its call history', async () => {
    const { server, db, signIn } = app();
    const { body } = await signIn();
    db.saveCall({ ...newCallRecord('5e6ca169-0903-45cc-b724-e253756f3726', dentistRequest()), userId: body.me.id });
    expect(db.callsForUser(body.me.id)).toHaveLength(1);
    await server.inject({ method: 'DELETE', url: '/api/me', headers: { authorization: `Bearer ${body.token}` } });
    expect(db.userById(body.me.id)).toBeUndefined();
    expect(db.callsForUser(body.me.id)).toHaveLength(0);
  });
});

describe('learning from calls', () => {
  const finished = () => {
    const r = newCallRecord('9f98a5d1-2777-498d-a7e3-e92672d0482c', dentistRequest({ counterpartName: 'Smile Dental', category: 'healthcare_appointment' }));
    r.result = {
      status: 'completed', success: true, objective: 'cleaning', appointment: { date: '2099-10-08', time: '15:30', notes: 'Cleaning' }, commitments: [],
      additionalChargesAuthorized: false, unresolvedQuestions: [], refusedDecisions: [], followUpsForUser: [], summary: '', summaryInUserLanguage: '',
      headlineInUserLanguage: '已预约 10月8日 15:30', counterpartNotes: ['Bring the insurance card.'], policyWarnings: [],
    };
    r.questions = [{ id: 'q1', askedAt: 1, expiresAt: 2, category: 'additional_cost', question: 'Add an $80 X-ray?', amountUsd: 80, status: 'answered', answer: { decision: 'decline', at: 3 } }];
    return r;
  };

  it('adds the contact, the appointment, and the decisions; a second call updates the same contact', () => {
    const once = learnFromCall({ ...emptyProfile(), timezone: 'America/Chicago' }, finished());
    expect(once.contacts).toMatchObject([{ name: 'Smile Dental', phone: '+14155550123', kind: 'clinic', language: 'English', notes: ['Bring the insurance card.'], callCount: 1, lastOutcome: '已预约 10月8日 15:30' }]);
    expect(once.appointments).toMatchObject([{ date: '2099-10-08', time: '15:30', with: 'Smile Dental' }]);
    expect(once.history.map((h) => h.text)).toEqual(['Smile Dental: declined "Add an $80 X-ray?"']);

    const twice = learnFromCall(once, { ...finished(), id: 'another' });
    expect(twice.contacts).toHaveLength(1);
    expect(twice.contacts[0]).toMatchObject({ callCount: 2, notes: ['Bring the insurance card.'] });

    const summary = profileForPrompt(twice);
    expect(summary).toContain('Smile Dental (clinic): +1 (415)-555-0123');
    expect(summary).toContain('2099-10-08 15:30 with Smile Dental');
  });
});

describe('phone book', () => {
  it('adds, edits, and deletes contacts; rejects bad numbers, duplicates, and sensitive notes', async () => {
    const { server, signIn } = app();
    const { body } = await signIn();
    const auth = { authorization: `Bearer ${body.token}` };
    const add = await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'Maria', phone: '747-283-6440', relationship: 'girlfriend', language: 'Tagalog' } });
    const maria = (add.json() as Me).profile.contacts[0]!;
    expect(maria).toMatchObject({ name: 'Maria', phone: '+17472836440', relationship: 'girlfriend', language: 'Tagalog' });

    expect((await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'Dup', phone: '+1 (747) 283-6440' } })).statusCode).toBe(422);
    expect((await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'Bad', phone: '911' } })).statusCode).toBe(422);
    expect((await server.inject({ method: 'POST', url: '/api/me/contacts', headers: auth, payload: { name: 'X', phone: '4155550100', notes: ['card 4111 1111 1111 1111'] } })).statusCode).toBe(422);

    const edited = await server.inject({ method: 'PATCH', url: `/api/me/contacts/${maria.id}`, headers: auth, payload: { name: 'Maria Santos', phone: '7472836440', relationship: 'girlfriend' } });
    const after = (edited.json() as Me).profile.contacts[0]!;
    expect(after).toMatchObject({ id: maria.id, name: 'Maria Santos' });
    expect(after.language).toBeUndefined(); // cleared by the edit

    const del = await server.inject({ method: 'DELETE', url: `/api/me/contacts/${maria.id}`, headers: auth });
    expect((del.json() as Me).profile.contacts).toHaveLength(0);
  });

  it("keeps the user's name for a contact and fills in the relationship from calls", () => {
    const profile = { ...emptyProfile(), contacts: [{ id: 'm', name: 'Maria', phone: '+14155550123', notes: [], callCount: 1 }] };
    const r = newCallRecord('11111111-2222-3333-4444-555555555555', dentistRequest({ counterpartName: 'my girlfriend', counterpartRelationship: 'girlfriend', callLanguage: 'Tagalog' }));
    const next = learnFromCall(profile, r);
    expect(next.contacts).toMatchObject([{ id: 'm', name: 'Maria', relationship: 'girlfriend', language: 'Tagalog', callCount: 2 }]);
    expect(profileForPrompt(next)).toContain('Maria (girlfriend): +1 (415)-555-0123; calls in Tagalog');
  });
});

describe('push tokens', () => {
  it('registers this phone for notifications, moves it between accounts, and forgets it on request', async () => {
    const { db, server, signIn } = app();
    const { body } = await signIn();
    const auth = { authorization: `Bearer ${body.token}` };
    const token = 'ExponentPushToken[abc123]';
    expect((await server.inject({ method: 'POST', url: '/api/me/push-tokens', headers: auth, payload: { token: 'not-a-token' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/me/push-tokens', headers: auth, payload: { token, platform: 'ios' } })).statusCode).toBe(200);
    expect(db.pushTokensFor(body.me.id)).toEqual([token]);

    const other = db.createUser('+19015550199', emptyProfile());
    db.addPushToken(other.id, token, 'ios');
    expect(db.pushTokensFor(body.me.id)).toEqual([]);
    db.addPushToken(body.me.id, token, 'ios');

    expect((await server.inject({ method: 'DELETE', url: '/api/me/push-tokens', headers: auth, payload: { token } })).statusCode).toBe(200);
    expect(db.pushTokensFor(body.me.id)).toEqual([]);
  });
});

