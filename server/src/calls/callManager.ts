import { timingSafeEqual } from 'node:crypto';
import type { CallRecord, CallRequest } from '../../../shared/types';
import { displayPhone } from '../../../shared/phone';
import { findSensitiveData } from '../policy/sensitive';
import type { MediaTransport, TelephonyCallState } from '../providers/telephony/types';
import { blockedReason, normalizePhone } from '../util/phone';
import { CallSession, newCallId, newCallRecord, type CallSessionDeps } from './callSession';
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
}

type SessionDeps = Omit<CallSessionDeps, 'onFinished' | 'store'>;

export class CallManager {
  private readonly sessions = new Map<string, CallSession>();
  private readonly recentStarts: number[] = [];

  constructor(
    private readonly store: CallStore,
    private readonly sessionDeps: () => SessionDeps,
    private readonly opts: CallManagerOptions,
  ) {}

  /** Validates the request against product guardrails and starts the call. */
  startCall(input: CallRequest): CallRecord {
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
    const record = newCallRecord(id, request);
    this.store.create(record);
    const session = new CallSession(id, {
      ...this.sessionDeps(),
      store: this.store,
      onFinished: (callId) => this.sessions.delete(callId),
    });
    this.sessions.set(id, session);
    void session.start();
    return record;
  }

  handleTelephonyState(callId: string, state: TelephonyCallState) {
    this.sessions.get(callId)?.handleTelephonyState(state);
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

  /** Stream token for a live call (used to serve its TwiML by URL). */
  streamTokenFor(callId: string): string | null {
    return this.sessions.get(callId)?.streamToken ?? null;
  }

  get activeCount() {
    return this.sessions.size;
  }
}
