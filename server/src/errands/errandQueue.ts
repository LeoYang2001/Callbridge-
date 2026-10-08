import { randomUUID } from 'node:crypto';
import type { CallRecord, CallRequest, Errand, PushData } from '../../../shared/types';
import { displayPhone } from '../../../shared/phone';
import { CallRejectedError } from '../calls/callManager';
import type { Database } from '../db/database';
import type { PushMessage } from '../push/push';
import { callingHoursFor, nextCallingTime } from './callingHours';

/**
 * The errand queue: calls the server places for the user on its own, so they can queue up
 * their errands and walk away. It dials one call at a time, only when the line is free, within
 * calling hours in the user's time zone, and retries busy or unanswered lines a few times.
 *
 * It decides only when to call. What the call may do is unchanged: every errand passed the same
 * ground rules as a call placed by hand when it was queued, and the call manager checks it
 * again when it dials. Questions the assistant asks mid-call still reach the user's phone; if
 * nobody answers, the assistant declines and the errand comes back as "needs you".
 */

export interface ErrandQueueOptions {
  /** Attempts per errand (busy / no answer / voicemail count; a call that connected ends it). */
  maxAttempts: number;
  retryDelayMs: number;
  /** Quiet time between two errand calls. */
  gapMs: number;
  /** Errand calls per user per 24 hours. */
  maxCallsPerDay: number;
  /** Wait before trying again when another call has the line. */
  busyLineDelayMs: number;
}

export const DEFAULT_ERRAND_OPTIONS: ErrandQueueOptions = {
  maxAttempts: 3,
  retryDelayMs: 20 * 60_000,
  gapMs: 60_000,
  maxCallsPerDay: 20,
  busyLineDelayMs: 2 * 60_000,
};

export interface ErrandQueueDeps {
  db: Database;
  /** Places the call (CallManager.startCall); throws CallRejectedError when it can't. */
  startCall: (request: CallRequest, userId: string) => CallRecord;
  /** No call in progress, so the line is free. */
  lineFree: () => boolean;
  isLive: (callId: string) => boolean;
  callRecord: (callId: string) => CallRecord | undefined;
  notify: (userId: string, message: Omit<PushMessage, 'to'>) => void;
  log: (message: string, detail?: Record<string, unknown>) => void;
  now?: () => number;
  options?: Partial<ErrandQueueOptions>;
}

const ACTIVE = new Set<Errand['status']>(['queued', 'calling']);
/** Results that mean nobody took the call: try again later. */
const NOT_REACHED = new Set(['busy', 'no_answer', 'voicemail', 'failed']);

const who = (e: Errand) => e.request.counterpartName?.trim() || displayPhone(e.request.to);

export class ErrandQueue {
  private readonly opts: ErrandQueueOptions;
  private readonly now: () => number;
  private lastCallEndedAt = 0;
  private timer: NodeJS.Timeout | undefined;
  private interval: NodeJS.Timeout | undefined;

  constructor(private readonly deps: ErrandQueueDeps) {
    this.opts = { ...DEFAULT_ERRAND_OPTIONS, ...deps.options };
    this.now = deps.now ?? Date.now;
  }

  /** Recovers from a restart and starts checking the queue every `everyMs`. */
  start(everyMs = 20_000) {
    this.recover();
    this.interval = setInterval(() => this.tick(), everyMs);
    this.interval.unref?.();
    this.kick();
  }

  stop() {
    clearInterval(this.interval);
    clearTimeout(this.timer);
  }

  add(userId: string, request: CallRequest, notBefore?: number): Errand {
    const now = this.now();
    const errand: Errand = {
      id: randomUUID(),
      userId,
      createdAt: now,
      request,
      status: 'queued',
      notBefore: notBefore && notBefore > now ? notBefore : undefined,
      nextAttemptAt: notBefore && notBefore > now ? notBefore : now,
      waitingFor: notBefore && notBefore > now ? 'scheduled' : 'turn',
      attempts: [],
      attemptBudget: this.opts.maxAttempts,
    };
    this.deps.db.saveErrand(errand);
    this.deps.log('errand.queued', { errandId: errand.id, to: request.to });
    this.kick();
    return errand;
  }

  list(userId: string): Errand[] {
    return this.deps.db.errandsForUser(userId);
  }

  get(userId: string, id: string): Errand | undefined {
    const e = this.deps.db.errand(id);
    return e && e.userId === userId ? e : undefined;
  }

  /** Stops an errand. Returns the call to hang up, if it was on one. */
  cancel(userId: string, id: string): { errand: Errand; hangUp?: string } | null {
    const e = this.get(userId, id);
    if (!e || !ACTIVE.has(e.status)) return null;
    const hangUp = e.status === 'calling' ? e.callId : undefined;
    this.finish(e, 'canceled', 'Canceled.');
    return { errand: e, hangUp };
  }

  /** Puts a finished errand back in the queue with a fresh set of attempts. */
  retry(userId: string, id: string): Errand | null {
    const e = this.get(userId, id);
    if (!e || ACTIVE.has(e.status)) return null;
    Object.assign(e, {
      status: 'queued',
      nextAttemptAt: this.now(),
      waitingFor: 'turn',
      attemptBudget: e.attempts.length + this.opts.maxAttempts,
      outcome: undefined,
      finishedAt: undefined,
      summarized: false,
    } satisfies Partial<Errand>);
    this.deps.db.saveErrand(e);
    this.kick();
    return e;
  }

  /**
   * A call finished. Returns true if the queue placed it: its notifications are then the
   * queue's to send (one summary, not one per call or retry).
   */
  callFinished(record: CallRecord): boolean {
    const e = this.deps.db.errandForCall(record.id);
    if (!e) return false;
    if (e.status !== 'calling') return true; // canceled mid-call
    this.lastCallEndedAt = this.now();
    const attempt = e.attempts.find((a) => a.callId === record.id);
    const result = record.result;
    if (attempt) attempt.outcome = result?.status ?? record.status;

    if (!result || NOT_REACHED.has(result.status)) {
      const why = record.failureReason ?? (result?.status === 'voicemail' ? 'Went to voicemail.' : 'No answer.');
      if (e.attempts.length < e.attemptBudget) {
        Object.assign(e, { status: 'queued', waitingFor: 'retry', nextAttemptAt: this.now() + this.opts.retryDelayMs, outcome: why } satisfies Partial<Errand>);
        this.deps.db.saveErrand(e);
        this.deps.log('errand.retry', { errandId: e.id, why });
      } else {
        this.finish(e, 'failed', `${why} Tried ${e.attempts.length} times.`);
      }
    } else {
      const outcome = result.headlineInUserLanguage || result.summaryInUserLanguage || result.summary;
      this.finish(e, result.success ? 'done' : 'needs_you', outcome);
    }
    this.kick(this.opts.gapMs);
    return true;
  }

  /** Places the next due call, if the line is free. */
  tick() {
    const now = this.now();
    if (!this.deps.lineFree() || now < this.lastCallEndedAt + this.opts.gapMs) return;
    const due = this.deps.db
      .activeErrands()
      .filter((e) => e.status === 'queued' && (e.nextAttemptAt ?? 0) <= now)
      .sort((a, b) => (a.nextAttemptAt ?? 0) - (b.nextAttemptAt ?? 0) || a.createdAt - b.createdAt);

    for (const e of due) {
      const opens = nextCallingTime(callingHoursFor(e.request.category), e.request.timezone, now);
      if (opens > now) {
        this.wait(e, 'calling_hours', opens);
        continue;
      }
      if (this.callsToday(e.userId!, now) >= this.opts.maxCallsPerDay) {
        this.wait(e, 'daily_limit', now + 3_600_000);
        continue;
      }
      let record: CallRecord;
      try {
        record = this.deps.startCall(e.request, e.userId!);
      } catch (err) {
        const message = (err as Error).message;
        if (err instanceof CallRejectedError && (err.statusCode === 409 || err.statusCode === 429)) {
          // Someone else has the line, or the hourly limit: everything waits.
          this.wait(e, 'another_call', now + this.opts.busyLineDelayMs);
          return;
        }
        this.finish(e, 'failed', message);
        continue;
      }
      e.attempts.push({ callId: record.id, startedAt: now });
      Object.assign(e, { status: 'calling', callId: record.id, waitingFor: undefined, nextAttemptAt: undefined } satisfies Partial<Errand>);
      this.deps.db.saveErrand(e);
      this.deps.log('errand.calling', { errandId: e.id, callId: record.id, attempt: e.attempts.length });
      return; // one call at a time
    }
  }

  /** After a restart: an errand that was mid-call either finished (record it) or died with the server (call again). */
  recover() {
    for (const e of this.deps.db.activeErrands()) {
      if (e.status !== 'calling' || !e.callId || this.deps.isLive(e.callId)) continue;
      const record = this.deps.callRecord(e.callId);
      if (record && (record.status === 'completed' || record.status === 'failed') && record.result) {
        this.callFinished(record);
      } else {
        const attempt = e.attempts.find((a) => a.callId === e.callId);
        if (attempt) attempt.outcome = 'interrupted';
        Object.assign(e, { status: 'queued', waitingFor: 'retry', nextAttemptAt: this.now() } satisfies Partial<Errand>);
        this.deps.db.saveErrand(e);
      }
    }
  }

  private wait(e: Errand, why: NonNullable<Errand['waitingFor']>, until: number) {
    if (e.waitingFor === why && e.nextAttemptAt === until) return;
    Object.assign(e, { waitingFor: why, nextAttemptAt: until } satisfies Partial<Errand>);
    this.deps.db.saveErrand(e);
  }

  private callsToday(userId: string, now: number) {
    return this.deps.db.errandsForUser(userId, 200).reduce((n, e) => n + e.attempts.filter((a) => a.startedAt > now - 86_400_000).length, 0);
  }

  private finish(e: Errand, status: Errand['status'], outcome: string) {
    Object.assign(e, { status, outcome, finishedAt: this.now(), waitingFor: undefined, nextAttemptAt: undefined } satisfies Partial<Errand>);
    this.deps.db.saveErrand(e);
    this.deps.log('errand.finished', { errandId: e.id, status });
    if (status !== 'canceled') this.report(e);
  }

  /**
   * Tells the user how it went: one summary once their queue is empty, or a push right away
   * when an errand needs them and others are still waiting.
   */
  private report(e: Errand) {
    const userId = e.userId!;
    const errands = this.deps.db.errandsForUser(userId, 200);
    const stillGoing = errands.some((x) => ACTIVE.has(x.status));
    if (stillGoing) {
      if (e.status === 'needs_you' || e.status === 'failed') {
        const data: PushData = e.callId ? { kind: e.status === 'failed' ? 'failed' : 'finished', callId: e.callId } : { kind: 'errands' };
        this.deps.notify(userId, { title: `${who(e)}: ${e.status === 'failed' ? "couldn't get through" : 'needs you'}`, body: e.outcome ?? '', data });
      }
      return;
    }
    const batch = errands.filter((x) => x.finishedAt && !x.summarized && x.status !== 'canceled');
    if (!batch.length) return;
    const done = batch.filter((x) => x.status === 'done').length;
    const mark = { done: '✓', needs_you: '•', failed: '✗' } as Record<string, string>;
    this.deps.notify(userId, {
      title: `Errands: ${done} of ${batch.length} done`,
      body: batch
        .slice(0, 6)
        .map((x) => `${mark[x.status] ?? '•'} ${who(x)}: ${x.status === 'needs_you' ? 'needs you · ' : ''}${x.outcome ?? ''}`.trim())
        .join('\n'),
      data: { kind: 'errands' },
    });
    for (const x of batch) {
      x.summarized = true;
      this.deps.db.saveErrand(x);
    }
  }

  /** Checks the queue soon (after an add or a finished call), not just on the interval. */
  private kick(delayMs = 0) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), delayMs + 50);
    this.timer.unref?.();
  }
}
