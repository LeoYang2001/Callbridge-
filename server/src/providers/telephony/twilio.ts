import { EventEmitter } from 'node:events';
import twilio from 'twilio';
import type { WebSocket } from 'ws';
import type {
  MediaTransport,
  MediaTransportEvents,
  PlaceCallParams,
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

export class TwilioTelephony implements TelephonyProvider {
  readonly name = 'twilio';
  private readonly client: twilio.Twilio;

  constructor(private readonly opts: TwilioOptions) {
    this.client = twilio(opts.accountSid, opts.authToken);
  }

  static statusCallbackUrl(publicBaseUrl: string, callId: string) {
    return `${publicBaseUrl}/twilio/status?callId=${encodeURIComponent(callId)}`;
  }

  async placeCall(p: PlaceCallParams) {
    const wsUrl = `${this.opts.publicBaseUrl.replace(/^http/, 'ws')}/twilio/media`;
    // <Connect><Stream> gives a bidirectional media stream; the call stays up as long as the
    // WebSocket does. No <Record> — recording is deliberately not enabled (consent varies by state).
    const twiml =
      `<Response><Connect><Stream url="${escapeXml(wsUrl)}">` +
      `<Parameter name="callId" value="${escapeXml(p.callId)}"/>` +
      `<Parameter name="token" value="${escapeXml(p.streamToken)}"/>` +
      `</Stream></Connect></Response>`;

    const call = await this.client.calls.create({
      to: p.to,
      from: this.opts.fromNumber,
      twiml,
      timeout: 30, // seconds to ring before giving up
      timeLimit: p.maxDurationSeconds,
      statusCallback: TwilioTelephony.statusCallbackUrl(this.opts.publicBaseUrl, p.callId),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });
    return { providerCallId: call.sid };
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
