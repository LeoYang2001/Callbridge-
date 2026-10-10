import { EventEmitter } from 'node:events';
import twilio from 'twilio';
import type { WebSocket } from 'ws';
import type {
  MediaTransport,
  MediaTransportEvents,
  PlaceCallParams,
  PlaceUserLegParams,
  TelephonyCallState,
  TelephonyProvider,
} from './types';

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  publicBaseUrl: string;
}

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

type CallCreateOptions = Parameters<twilio.Twilio['calls']['create']>[0];

/** Twilio's "Limited trial" plan rejects some call options with this error. */
const isTrialRestriction = (err: unknown) => /trial account|disallowed parameter|limited parameter/i.test((err as Error)?.message ?? '');

export class TwilioTelephony implements TelephonyProvider {
  readonly name = 'twilio';
  private readonly client: twilio.Twilio;
  /** Index of the first call setup Twilio accepted, reused for later calls. */
  private acceptedAttempt = 0;

  constructor(
    private readonly opts: TwilioOptions,
    client?: twilio.Twilio,
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.client = client ?? twilio(opts.accountSid, opts.authToken);
  }

  static statusCallbackUrl(publicBaseUrl: string, callId: string) {
    return `${publicBaseUrl}/twilio/status?callId=${encodeURIComponent(callId)}`;
  }

  static twimlUrl(publicBaseUrl: string, callId: string) {
    return `${publicBaseUrl}/twilio/twiml?callId=${encodeURIComponent(callId)}`;
  }

  /**
   * TwiML that connects the answered call to our media WebSocket. <Connect><Stream> keeps the call
   * up as long as the WebSocket is open. No <Record>: recording is deliberately not enabled
   * (consent rules vary by state).
   */
  static streamTwiml(publicBaseUrl: string, callId: string, streamToken: string) {
    const wsUrl = `${publicBaseUrl.replace(/^http/, 'ws')}/twilio/media`;
    return (
      `<Response><Connect><Stream url="${escapeXml(wsUrl)}">` +
      `<Parameter name="callId" value="${escapeXml(callId)}"/>` +
      `<Parameter name="token" value="${escapeXml(streamToken)}"/>` +
      `</Stream></Connect></Response>`
    );
  }

  /**
   * Call setups from richest to most basic. Twilio's Limited trial rejects some options without
   * saying which, so we fall back step by step; the session polls call status, so the call is
   * still tracked if status callbacks end up disabled.
   */
  private attempts(p: PlaceCallParams): { label: string; options: CallCreateOptions }[] {
    const base = { to: p.to, from: p.from ?? this.opts.fromNumber };
    const twiml = TwilioTelephony.streamTwiml(this.opts.publicBaseUrl, p.callId, p.streamToken);
    const url = TwilioTelephony.twimlUrl(this.opts.publicBaseUrl, p.callId);
    const callbacks = {
      statusCallback: TwilioTelephony.statusCallbackUrl(this.opts.publicBaseUrl, p.callId),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    };
    return [
      { label: 'full', options: { ...base, twiml, timeout: 30, timeLimit: p.maxDurationSeconds, ...callbacks } },
      { label: 'no time limits', options: { ...base, twiml, ...callbacks } },
      { label: 'TwiML by URL', options: { ...base, url, method: 'POST', ...callbacks } },
      { label: 'TwiML by URL, completion callback only', options: { ...base, url, method: 'POST', statusCallback: callbacks.statusCallback, statusCallbackMethod: 'POST' } },
      { label: 'minimal', options: { ...base, url } },
    ];
  }

  async placeCall(p: PlaceCallParams) {
    const attempts = this.attempts(p);
    let lastError: unknown;
    for (let i = this.acceptedAttempt; i < attempts.length; i++) {
      const { label, options } = attempts[i]!;
      try {
        const call = await this.client.calls.create(options);
        if (i > 0) this.log(`Twilio accepted call setup "${label}"`);
        this.acceptedAttempt = i;
        return { providerCallId: call.sid };
      } catch (err) {
        lastError = err;
        if (!isTrialRestriction(err)) throw err;
        this.log(`Twilio rejected call setup "${label}": ${(err as Error).message}`);
      }
    }
    throw new Error(
      `${(lastError as Error)?.message ?? 'Twilio rejected the call'}. Twilio's Limited trial blocks this call; upgrade the account to Full access in the Twilio console.`,
    );
  }

  /** TwiML that streams the user's own leg (their phone, or the app) to the media endpoint. */
  static userStreamTwiml(publicBaseUrl: string, callId: string, streamToken: string, greeting?: string) {
    const wsUrl = `${publicBaseUrl.replace(/^http/, 'ws')}/twilio/media`;
    return (
      `<Response>${greeting ? `<Say>${escapeXml(greeting)}</Say>` : ''}<Connect><Stream url="${escapeXml(wsUrl)}">` +
      `<Parameter name="callId" value="${escapeXml(callId)}"/>` +
      `<Parameter name="token" value="${escapeXml(streamToken)}"/>` +
      `<Parameter name="leg" value="user"/>` +
      `</Stream></Connect></Response>`
    );
  }

  /**
   * Rings the user's phone into their call: a short line, then their audio streams to the same
   * media endpoint (marked as the user's leg), and the server relays it to the other party.
   */
  async placeUserLeg(p: PlaceUserLegParams) {
    const twiml = TwilioTelephony.userStreamTwiml(this.opts.publicBaseUrl, p.callId, p.streamToken, 'Connecting you to your call.');
    const call = await this.client.calls.create({
      to: p.to,
      from: this.opts.fromNumber,
      twiml,
      timeout: 25,
      timeLimit: p.maxDurationSeconds,
      statusCallback: `${TwilioTelephony.statusCallbackUrl(this.opts.publicBaseUrl, p.callId)}&leg=user`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });
    return { providerCallId: call.sid };
  }

  /**
   * Verifies a user's own number as a caller ID: Twilio calls it, and the user types the code
   * shown in the app on the keypad. After that, calls may show their number.
   */
  async startCallerIdVerification(phone: string, label: string) {
    const v = await this.client.validationRequests.create({ phoneNumber: phone, friendlyName: label.slice(0, 64) });
    return { validationCode: String(v.validationCode) };
  }

  async isVerifiedCallerId(phone: string) {
    const ids = await this.client.outgoingCallerIds.list({ phoneNumber: phone, limit: 1 });
    return ids.some((i) => i.phoneNumber === phone);
  }

  async getCallState(providerCallId: string) {
    const call = await this.client.calls(providerCallId).fetch();
    return mapTwilioStatus(call.status);
  }

  async hangup(providerCallId: string) {
    await this.client.calls(providerCallId).update({ status: 'completed' });
  }

  validateSignature(signature: string | undefined, url: string, params: Record<string, unknown>) {
    if (!signature) return false;
    return twilio.validateRequest(this.opts.authToken, signature, url, params);
  }
}

/** Maps Twilio's CallStatus to the provider-neutral call state. */
export function mapTwilioStatus(status: string): TelephonyCallState | null {
  switch (status) {
    case 'queued':
    case 'initiated':
      return 'initiated';
    case 'ringing':
      return 'ringing';
    case 'in-progress':
      return 'answered';
    case 'completed':
      return 'completed';
    case 'busy':
      return 'busy';
    case 'no-answer':
      return 'no_answer';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return null;
  }
}

export interface TwilioStreamStart {
  streamSid: string;
  callSid: string;
  customParameters: Record<string, string>;
}

type TwilioMessage =
  | { event: 'connected' }
  | { event: 'start'; start: TwilioStreamStart }
  | { event: 'media'; media: { payload: string; timestamp: string; track?: string } }
  | { event: 'mark'; mark: { name: string } }
  | { event: 'stop' }
  | { event: 'dtmf'; dtmf: { digit: string } };

/** One Twilio Media Stream WebSocket, exposed as a provider-neutral MediaTransport. */
export class TwilioMediaTransport implements MediaTransport {
  private readonly emitter = new EventEmitter();
  private streamSid: string | null = null;
  private readonly started: Promise<TwilioStreamStart>;

  constructor(private readonly ws: WebSocket) {
    let resolveStart!: (s: TwilioStreamStart) => void;
    let rejectStart!: (e: Error) => void;
    this.started = new Promise((res, rej) => {
      resolveStart = res;
      rejectStart = rej;
    });
    this.started.catch(() => {}); // avoid unhandled rejection if nobody awaits

    ws.on('message', (raw) => {
      let msg: TwilioMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.event) {
        case 'start':
          this.streamSid = msg.start.streamSid;
          resolveStart(msg.start);
          break;
        case 'media':
          this.emitter.emit('audio', msg.media.payload, Number(msg.media.timestamp) || 0);
          break;
        case 'mark':
          this.emitter.emit('mark', msg.mark.name);
          break;
        case 'stop':
          this.emitter.emit('stop');
          break;
      }
    });
    ws.on('close', () => {
      rejectStart(new Error('Media stream closed before start'));
      this.emitter.emit('stop');
    });
  }

  /** Resolves with the stream's start message (which carries our callId + token). */
  waitForStart(timeoutMs = 10_000): Promise<TwilioStreamStart> {
    return Promise.race([
      this.started,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timed out waiting for stream start')), timeoutMs)),
    ]);
  }

  private send(msg: object) {
    if (this.ws.readyState === this.ws.OPEN && this.streamSid) this.ws.send(JSON.stringify(msg));
  }

  sendAudio(payloadB64: string) {
    this.send({ event: 'media', streamSid: this.streamSid, media: { payload: payloadB64 } });
  }

  clearAudio() {
    this.send({ event: 'clear', streamSid: this.streamSid });
  }

  sendMark(name: string) {
    this.send({ event: 'mark', streamSid: this.streamSid, mark: { name } });
  }

  on<E extends keyof MediaTransportEvents>(event: E, listener: MediaTransportEvents[E]) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  close() {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) this.ws.close();
  }
}
