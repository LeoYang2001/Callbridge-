import { randomBytes } from 'node:crypto';
import type { TranslatedCallRecord, TranslatedCallRequest } from '../../../shared/types';
import { languageCode } from '../../../shared/languages';
import type { MediaTransport, TelephonyCallState } from '../providers/telephony/types';
import { blockedReason, normalizePhone } from '../util/phone';
import { CallRejectedError } from './callManager';
import { TranslatedCall, type TranslatedCallDeps } from './translatedCall';

/** Translated calls' ids start with this, so Twilio webhooks reach the right manager. */
export const TRANSLATED_PREFIX = 'tc_';

export const isTranslatedCallId = (id: string) => id.startsWith(TRANSLATED_PREFIX);

export interface TranslatedCallManagerOptions {
  allowedDestinations: string[] | null;
  maxCallsPerHour: number;
  /** Finished calls kept in memory for the app to show (newest first). */
  keepFinished?: number;
}

type CallDeps = Omit<TranslatedCallDeps, 'onChange' | 'onFinished' | 'userPhone' | 'callerId' | 'userName'>;

export interface CallerInfo {
  userId: string;
  name: string;
  language: string;
  phone?: string;
  callerId?: string;
}

export class TranslatedCallManager {
  private readonly calls = new Map<string, TranslatedCall>();
  private readonly finished: TranslatedCallRecord[] = [];
  private readonly recentStarts: number[] = [];

  constructor(
    private readonly deps: () => CallDeps,
    private readonly opts: TranslatedCallManagerOptions,
  ) {}

  async start(input: TranslatedCallRequest, caller: CallerInfo): Promise<{ record: TranslatedCallRecord; code?: string }> {
    const to = normalizePhone(input.to);
    if (!to) throw new CallRejectedError('Enter a valid phone number, e.g. +14155550123.');
    const blocked = blockedReason(to);
    if (blocked) throw new CallRejectedError(`This number cannot be called: ${blocked}.`);
    if (this.opts.allowedDestinations && !this.opts.allowedDestinations.includes(to)) {
      throw new CallRejectedError(`${to} is not on the allowlist (ALLOWED_DESTINATIONS) for this deployment.`, 403);
    }
    if (caller.phone && to === caller.phone) throw new CallRejectedError("That's your own number.");
    if (!languageCode(input.theirLanguage)) throw new CallRejectedError(`Translation for ${input.theirLanguage} isn't available.`);
    if (languageCode(input.theirLanguage) === languageCode(caller.language)) {
      throw new CallRejectedError(`You both speak ${input.theirLanguage}, so there's nothing to translate. Call them directly.`);
    }
    if ([...this.calls.values()].some((c) => c.record.userId === caller.userId)) {
      throw new CallRejectedError('You already have a call in progress.', 409);
    }
    const hourAgo = Date.now() - 3_600_000;
    while (this.recentStarts.length && this.recentStarts[0]! < hourAgo) this.recentStarts.shift();
    if (this.recentStarts.length >= this.opts.maxCallsPerHour) throw new CallRejectedError('Hourly call limit reached for this deployment.', 429);
    this.recentStarts.push(Date.now());

    const record: TranslatedCallRecord = {
      id: `${TRANSLATED_PREFIX}${randomBytes(9).toString('base64url')}`,
      userId: caller.userId,
      request: { ...input, to },
      userLanguage: caller.language,
      status: 'connecting_you',
      createdAt: Date.now(),
      captions: input.captions ?? true,
      interpreter: 'off',
      lines: [],
    };
    const call = new TranslatedCall(record, {
      ...this.deps(),
      userPhone: caller.phone,
      callerId: caller.callerId,
      userName: caller.name,
      onChange: () => {},
      onFinished: (r) => {
        this.calls.delete(r.id);
        this.finished.unshift(r);
        this.finished.length = Math.min(this.finished.length, this.opts.keepFinished ?? 50);
      },
    });
    this.calls.set(record.id, call);
    const { code } = await call.start();
    return { record, code };
  }

  /** A call the user placed (live or recently finished). */
  get(id: string, userId: string): TranslatedCallRecord | undefined {
    const r = this.calls.get(id)?.record ?? this.finished.find((f) => f.id === id);
    return r && r.userId === userId ? r : undefined;
  }

  live(id: string, userId: string): TranslatedCall | undefined {
    const call = this.calls.get(id);
    return call && call.record.userId === userId ? call : undefined;
  }

  // Twilio webhooks.

  streamTokenFor(id: string) {
    return this.calls.get(id)?.themToken ?? null;
  }

  appJoinStream(id: string, code: string, legSid?: string) {
    return this.calls.get(id)?.appJoinStream(code, legSid) ?? null;
  }

  attachMedia(id: string, token: string, transport: MediaTransport): boolean {
    const call = this.calls.get(id);
    if (!call || token !== call.themToken) return false;
    call.attachMedia(transport);
    return true;
  }

  attachUserMedia(id: string, token: string, transport: MediaTransport): boolean {
    const call = this.calls.get(id);
    if (!call || token !== call.userToken) return false;
    call.attachUserMedia(transport);
    return true;
  }

  handleTelephonyState(id: string, state: TelephonyCallState) {
    this.calls.get(id)?.handleTelephonyState(state);
  }

  handleUserLegState(id: string, state: TelephonyCallState) {
    this.calls.get(id)?.handleUserLegState(state);
  }

  get activeCount() {
    return this.calls.size;
  }
}
