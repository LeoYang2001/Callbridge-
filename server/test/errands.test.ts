import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CallRecord, CallRequest, CallResult, Errand } from '../../shared/types';
import { CallRejectedError } from '../src/calls/callManager';
import { newCallRecord } from '../src/calls/callSession';
import { Database } from '../src/db/database';
import { CALLING_HOURS, nextCallingTime } from '../src/errands/callingHours';
import { ErrandQueue } from '../src/errands/errandQueue';
import { reviewTask } from '../src/policy/taskPolicy';
import { emptyProfile } from '../src/profile/profile';
import type { PushMessage } from '../src/push/push';
import { registerErrandRoutes } from '../src/routes/errands';
import type { AppConfig } from '../src/config';
import { dentistRequest } from './fixtures';

/** Wednesday 2026-10-07, 1:00 pm in Los Angeles (the fixtures' time zone). */
const WED_1PM = Date.parse('2026-10-07T20:00:00Z');
const MIN = 60_000;

function result(status: CallResult['status'], success: boolean, headline = ''): CallResult {
  return {
    status,
    success,
    objective: 'x',
    appointment: null,
    commitments: [],
    additionalChargesAuthorized: false,
    unresolvedQuestions: [],
    refusedDecisions: [],
    followUpsForUser: [],
    summary: headline,
    summaryInUserLanguage: headline,
    headlineInUserLanguage: headline,
    policyWarnings: [],
  };
}

function setup() {
  const db = new Database(':memory:');
  const user = db.createUser('+19014553148', emptyProfile());
  let now = WED_1PM;
  const calls = new Map<string, CallRecord>();
  const live = new Set<string>();
  const pushes: Omit<PushMessage, 'to'>[] = [];
  let reject: CallRejectedError | null = null;
  const queue = new ErrandQueue({
    db,
    startCall: (request) => {
      if (reject) throw reject;
      const r = newCallRecord(`call-${calls.size + 1}`, request);
      calls.set(r.id, r);
      live.add(r.id);
      return r;
    },
    lineFree: () => live.size === 0,
    isLive: (id) => live.has(id),
    callRecord: (id) => calls.get(id),
    notify: (_userId, m) => pushes.push(m),
    log: () => {},
    now: () => now,
  });
  /** The live call ends with this result. */
  const end = (status: CallResult['status'], success = false, headline = '') => {
    const id = [...live][0]!;
    live.delete(id);
    const r = calls.get(id)!;
    r.status = status === 'completed' || status === 'voicemail' ? 'completed' : 'failed';
    r.result = result(status, success, headline);
    return queue.callFinished(r);
  };
  const add = (overrides: Partial<CallRequest> = {}, notBefore?: number) => queue.add(user.id, { ...dentistRequest(overrides), category: 'healthcare_appointment' }, notBefore);
  const get = (e: Errand) => db.errand(e.id)!;
  return { db, user, queue, calls, live, pushes, add, end, get, advance: (ms: number) => (now += ms), setReject: (e: CallRejectedError | null) => (reject = e) };
}

describe('calling hours', () => {
  it('waits for the next weekday morning for a business, and allows evenings for personal calls', () => {
    const tz = 'America/Los_Angeles';
    const sat7pm = Date.parse('2026-10-11T02:00:00Z'); // Saturday 7:00 pm in LA
    expect(new Date(nextCallingTime(CALLING_HOURS.business, tz, sat7pm)).toISOString()).toBe('2026-10-12T16:00:00.000Z'); // Monday 9:00
    expect(nextCallingTime(CALLING_HOURS.personal, tz, sat7pm)).toBe(sat7pm);
    expect(nextCallingTime(CALLING_HOURS.business, tz, WED_1PM)).toBe(WED_1PM);
  });
});

describe('errand queue', () => {
  it('calls one errand at a time, in order, with a gap between calls', () => {
    const t = setup();
    const a = t.add({ counterpartName: 'Dentist' });
    const b = t.add({ counterpartName: 'Pharmacy', to: '+14155550124' });
    t.queue.tick();
    expect(t.get(a).status).toBe('calling');
    expect(t.get(b).status).toBe('queued');
    t.queue.tick(); // the line is busy with the first one
    expect(t.calls.size).toBe(1);

    expect(t.end('completed', true, '约好了周三下午3点')).toBe(true);
    expect(t.get(a)).toMatchObject({ status: 'done', outcome: '约好了周三下午3点' });
    t.queue.tick();
    expect(t.get(b).status).toBe('queued'); // still in the gap after the last call
    t.advance(2 * MIN);
    t.queue.tick();
    expect(t.get(b).status).toBe('calling');
  });

  it('retries a busy line, then gives up and reports the batch', () => {
    const t = setup();
    const e = t.add();
    for (let i = 1; i <= 3; i++) {
      t.queue.tick();
      expect(t.get(e).status).toBe('calling');
      t.end('busy');
      t.advance(21 * MIN);
    }
    expect(t.get(e)).toMatchObject({ status: 'failed', attempts: [{ outcome: 'busy' }, { outcome: 'busy' }, { outcome: 'busy' }] });
    expect(t.get(e).outcome).toContain('Tried 3 times');
    expect(t.pushes).toHaveLength(1);
    expect(t.pushes[0]).toMatchObject({ title: 'Errands: 0 of 1 done', data: { kind: 'errands' } });
  });

  it('pushes right away when an errand needs the user and others are still waiting, then one summary', () => {
    const t = setup();
    t.add({ counterpartName: 'Dentist' });
    t.add({ counterpartName: 'Pharmacy', to: '+14155550124' });
    t.queue.tick();
    t.end('completed', false, '他们要你先确认保险');
    expect(t.pushes.at(-1)).toMatchObject({ title: 'Dentist: needs you', body: '他们要你先确认保险', data: { kind: 'finished', callId: 'call-1' } });
    t.advance(2 * MIN);
    t.queue.tick();
    t.end('completed', true, '药已经准备好了');
    expect(t.pushes.at(-1)!.title).toBe('Errands: 1 of 2 done');
    expect(t.pushes.at(-1)!.body).toBe('• Dentist: needs you · 他们要你先确认保险\n✓ Pharmacy: 药已经准备好了');
  });

  it('holds errands outside calling hours and until their scheduled time', () => {
    const t = setup();
    const later = t.add({}, WED_1PM + 3 * 3_600_000);
    t.queue.tick();
    expect(t.get(later)).toMatchObject({ status: 'queued', waitingFor: 'scheduled' });
    t.advance(6 * 3_600_000); // 7:00 pm: past business hours
    t.queue.tick();
    expect(t.get(later)).toMatchObject({ status: 'queued', waitingFor: 'calling_hours', nextAttemptAt: Date.parse('2026-10-08T16:00:00Z') });
  });

  it('waits when another call has the line, and fails on a refusal', () => {
    const t = setup();
    const e = t.add();
    t.setReject(new CallRejectedError('Another call is already in progress.', 409));
    t.queue.tick();
    expect(t.get(e)).toMatchObject({ status: 'queued', waitingFor: 'another_call' });
    t.setReject(new CallRejectedError('This number cannot be called.', 400));
    t.advance(3 * MIN);
    t.queue.tick();
    expect(t.get(e)).toMatchObject({ status: 'failed', outcome: 'This number cannot be called.' });
  });

  it('cancels mid-call (the caller hangs up) and can be retried', () => {
    const t = setup();
    const e = t.add();
    t.queue.tick();
    const canceled = t.queue.cancel(t.user.id, e.id)!;
    expect(canceled.hangUp).toBe('call-1');
    expect(t.end('completed')).toBe(true); // the hung-up call is still the queue's: no per-call push
    expect(t.get(e).status).toBe('canceled');
    expect(t.pushes).toHaveLength(0);
    expect(t.queue.retry(t.user.id, e.id)).toMatchObject({ status: 'queued', attemptBudget: 4 });
  });

  it('after a restart, calls again an errand whose call died with the server', () => {
    const t = setup();
    const e = t.add();
    t.queue.tick();
    t.live.clear(); // the server went down mid-call
    t.queue.recover();
    expect(t.get(e)).toMatchObject({ status: 'queued', waitingFor: 'retry', attempts: [{ outcome: 'interrupted' }] });
  });

  it('only shows a user their own errands', () => {
    const t = setup();
    const other = t.db.createUser('+19015550199', emptyProfile());
    const e = t.add();
    expect(t.queue.list(other.id)).toEqual([]);
    expect(t.queue.cancel(other.id, e.id)).toBeNull();
  });
});

describe('errand routes', () => {
  it('checks the request with the same ground rules as a call before queuing it', async () => {
    const t = setup();
    const server = Fastify();
    server.addHook('onRequest', async (req) => {
      req.user = t.db.userById(t.user.id);
    });
    const classifier = { review: async () => reviewTask('deceptive_or_harmful', '不允许') };
    registerErrandRoutes(server, {
      config: { telephonyConfigured: true, voiceConfigured: true } as AppConfig,
      queue: t.queue,
      manager: { endCall: () => true },
      checkDeps: { classifier, allowedDestinations: null },
    });
    const refused = await server.inject({ method: 'POST', url: '/api/errands', payload: { request: dentistRequest() } });
    expect(refused.statusCode).toBe(422);
    expect(t.queue.list(t.user.id)).toEqual([]);

    classifier.review = async () => reviewTask('healthcare_appointment', '');
    const ok = await server.inject({ method: 'POST', url: '/api/errands', payload: { request: dentistRequest(), notBefore: WED_1PM + 3_600_000 } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ status: 'queued', request: { category: 'healthcare_appointment' } });
  });
});
