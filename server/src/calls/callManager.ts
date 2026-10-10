import { timingSafeEqual } from 'node:crypto';
import type { CallRecord, CallRequest, UserAnswer, UserQuestion } from '../../../shared/types';
import { displayPhone } from '../../../shared/phone';
import { findSensitiveData, sensitiveTextReason } from '../policy/sensitive';
import type { MediaTransport, TelephonyCallState } from '../providers/telephony/types';
import { blockedReason, normalizePhone } from '../util/phone';
import { CallSession, newCallId, newCallRecord, type CallSessionDeps, type ListenEvent } from './callSession';
import type { CallStore } from './store';

export class CallRejectedError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export interface CallManagerOptions {
  allowedDestinations: string[] | null;
  maxCallsPerHour: number;
  /** MVP guardrail: one live call at a time. This product never dials in bulk. */
  maxConcurrentCalls: number;
  /** Runs once a call is finished and saved (e.g. to update the user's profile). */
  onCallFinished?: (record: CallRecord) => void;
  /** The assistant is holding the line for the user's decision (e.g. to notify their phone). */
  onUserQuestion?: (record: CallRecord, question: UserQuestion) => void;
}

type SessionDeps = Omit<CallSessionDeps, 'onFinished' | 'onQuestion' | 'store'>;

export class CallManager {
  private readonly sessions = new Map<string, CallSession>();
  private readonly recentStarts: number[] = [];

  constructor(
    private readonly store: CallStore,
    private readonly sessionDeps: () => SessionDeps,
    private readonly opts: CallManagerOptions,
  ) {}

  /** Validates the request against product guardrails and starts the call. */
  startCall(input: CallRequest, userId?: string): CallRecord {
    const to = normalizePhone(input.to);
    if (!to) throw new CallRejectedError('Destination must be a valid phone number in international format, e.g. +14155550123.');
    const blocked = blockedReason(to);
    if (blocked) throw new CallRejectedError(`This number cannot be called: ${blocked}.`);
    if (this.opts.allowedDestinations && !this.opts.allowedDestinations.includes(to)) {
      throw new CallRejectedError(`${displayPhone(to)} is not on the allowlist (ALLOWED_DESTINATIONS) for this deployment.`, 403);
    }

    const request: CallRequest = { ...input, to };
    const sensitive = findSensitiveData(request);
    if (sensitive.length > 0) {
      throw new CallRejectedError(
        `Remove sensitive data before calling — the assistant must never be given it: ${sensitive.map((s) => `${s.field} ${s.reason}`).join('; ')}.`,
      );
    }

    if (this.sessions.size >= this.opts.maxConcurrentCalls) {
      throw new CallRejectedError('Another call is already in progress. Wait for it to finish.', 409);
    }
    const hourAgo = Date.now() - 3_600_000;
    while (this.recentStarts.length && this.recentStarts[0]! < hourAgo) this.recentStarts.shift();
    if (this.recentStarts.length >= this.opts.maxCallsPerHour) {
      throw new CallRejectedError('Hourly call limit reached for this deployment.', 429);
    }
    this.recentStarts.push(Date.now());

    const id = newCallId();
    const record = { ...newCallRecord(id, request), userId };
    this.store.create(record);
    const session = new CallSession(id, {
      ...this.sessionDeps(),
      store: this.store,
      onQuestion: (callId, question) => {
        const live = this.store.get(callId);
        if (!live) return;
        try {
          this.opts.onUserQuestion?.(live, question);
        } catch {
          /* a notification must never break the call */
        }
      },
      onFinished: (callId) => {
        this.sessions.delete(callId);
        const finished = this.store.get(callId);
        if (finished) {
          try {
            this.opts.onCallFinished?.(finished);
          } catch {
            /* a profile update must never break call wrap-up */
          }
        }
      },
    });
    this.sessions.set(id, session);
    void session.start();
    return record;
  }

  handleTelephonyState(callId: string, state: TelephonyCallState) {
    this.sessions.get(callId)?.handleTelephonyState(state);
  }

  /** The user's answer to a question asked mid-call. Returns an error message, or null. */
  answerQuestion(callId: string, questionId: string, answer: UserAnswer): { error: string; status: number } | null {
    const session = this.sessions.get(callId);
    if (!session) return { error: 'That call is no longer in progress.', status: 404 };
    if (answer.text) {
      const sensitive = sensitiveTextReason(answer.text);
      if (sensitive) return { error: `Not sent: ${sensitive}. The assistant must never be given that.`, status: 422 };
    }
    const error = session.answerQuestion(questionId, answer);
    return error ? { error, status: 409 } : null;
  }

  /** A message from the user to the assistant mid-call. Returns an error, or null. */
  sendUserMessage(callId: string, text: string): { error: string; status: number } | null {
    const session = this.sessions.get(callId);
    if (!session) return { error: 'That call is no longer in progress.', status: 404 };
    const sensitive = sensitiveTextReason(text);
    if (sensitive) return { error: `Not sent: ${sensitive}. The assistant must never be given that.`, status: 422 };
    session.sendUserMessage(text);
    return null;
  }

  /** Live audio of a call in progress, or null if it isn't live. */
  listen(callId: string, fn: (event: ListenEvent) => void): (() => void) | null {
    return this.sessions.get(callId)?.listen(fn) ?? null;
  }

  isLive(callId: string): boolean {
    return this.sessions.has(callId);
  }

  /** Hangs up a live call at the user's request. Returns false if it isn't live. */
  endCall(callId: string): boolean {
    const session = this.sessions.get(callId);
    if (!session) return false;
    session.endByUser();
    return true;
  }

  /** A live call as watchers see it (captions in step with the voice); other records as stored. */
  liveView(record: CallRecord): CallRecord {
    return this.sessions.get(record.id)?.liveView(record) ?? record;
  }

  /** Attach a media stream to its call. Returns false if the call/token don't match. */
  attachMedia(callId: string, token: string, transport: MediaTransport): boolean {
    const session = this.sessions.get(callId);
    if (!session) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(session.streamToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    session.attachMedia(transport);
    return true;
  }

  /** Take-over: ring the user into their call. Returns an error to show, or null. */
  async takeOver(callId: string, userPhone: string): Promise<{ status: number; error: string } | null> {
    const session = this.sessions.get(callId);
    if (!session) return { status: 404, error: 'That call is not in progress.' };
    const error = await session.takeOver(userPhone);
    return error ? { status: 409, error } : null;
  }

  /** In-app joining: start the take-over and get the one-time code the app's voice leg presents. */
  startAppJoin(callId: string): { code: string } | { status: number; error: string } {
    const session = this.sessions.get(callId);
    if (!session) return { status: 404, error: 'That call is not in progress.' };
    const r = session.startAppJoin();
    return 'error' in r ? { status: 409, error: r.error } : r;
  }

  /** In-app joining: the stream token for the app's voice leg, if its code is right. */
  appJoinStream(callId: string, code: string, legSid?: string): string | null {
    return this.sessions.get(callId)?.appJoinStream(code, legSid) ?? null;
  }

  /** Take-over: the user hands the call back to the assistant. */
  handBack(callId: string): boolean {
    const session = this.sessions.get(callId);
    if (!session) return false;
    session.handBack('user');
    return true;
  }

  /** The user's own leg answered: attach its media (checked against its own token). */
  attachUserMedia(callId: string, token: string, transport: MediaTransport): boolean {
    const session = this.sessions.get(callId);
    if (!session) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(session.userStreamToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    session.attachUserMedia(transport);
    return true;
  }

  /** Progress of the user's own leg (ringing, no answer, hung up). */
  handleUserLegState(callId: string, state: TelephonyCallState) {
    this.sessions.get(callId)?.handleUserLegState(state);
  }

  /** Stream token for a live call (used to serve its TwiML by URL). */
  streamTokenFor(callId: string): string | null {
    return this.sessions.get(callId)?.streamToken ?? null;
  }

  get activeCount() {
    return this.sessions.size;
  }
}
