import { EventEmitter } from 'node:events';
import type { MediaTransport, MediaTransportEvents } from '../providers/telephony/types';
import { ULAW_SILENCE } from './ulaw';

/**
 * An in-process phone line for the call simulator. It behaves like a Twilio media stream from
 * CallBridge's side: audio is played out in real time in 20 ms frames, silence fills the gaps
 * (so voice-activity detection works on both ends), playback marks are echoed once the audio
 * before them has played, and `clearAudio` drops whatever hasn't played yet.
 */

const FRAME_MS = 20;
const FRAME_BYTES = 160; // μ-law, 8 kHz

type Item = { kind: 'audio'; buf: Buffer; offset: number } | { kind: 'mark'; name: string };

/** One direction of the line: a queue of audio and marks, drained one frame at a time. */
export class AudioQueue {
  private items: Item[] = [];

  push(buf: Buffer) {
    if (buf.length) this.items.push({ kind: 'audio', buf, offset: 0 });
  }

  pushMark(name: string) {
    this.items.push({ kind: 'mark', name });
  }

  /** Unplayed audio, in ms. */
  get pendingMs(): number {
    let bytes = 0;
    for (const i of this.items) if (i.kind === 'audio') bytes += i.buf.length - i.offset;
    return bytes / (FRAME_BYTES / FRAME_MS);
  }

  /** Drops everything unplayed; returns the marks that were dropped. */
  clear(): string[] {
    const marks = this.items.flatMap((i) => (i.kind === 'mark' ? [i.name] : []));
    this.items = [];
    return marks;
  }

  /** The next 20 ms frame (padded with silence) and the marks reached by the end of it. */
  nextFrame(): { frame: Buffer; marks: string[]; voiced: boolean } {
    const frame = Buffer.alloc(FRAME_BYTES, ULAW_SILENCE);
    const marks: string[] = [];
    let filled = 0;
    while (this.items.length) {
      const head = this.items[0]!;
      if (head.kind === 'mark') {
        marks.push(head.name);
        this.items.shift();
        continue;
      }
      if (filled === FRAME_BYTES) break;
      const n = Math.min(FRAME_BYTES - filled, head.buf.length - head.offset);
      head.buf.copy(frame, filled, head.offset, head.offset + n);
      filled += n;
      head.offset += n;
      if (head.offset >= head.buf.length) this.items.shift();
    }
    return { frame, marks, voiced: filled > 0 };
  }
}

export type HangupBy = 'caller' | 'callee' | 'timeout';

export class PhoneLine {
  /** Audio CallBridge sends, on its way to the simulated business. */
  private readonly toCallee = new AudioQueue();
  /** Audio the simulated business sends, on its way to CallBridge. */
  private readonly toCaller = new AudioQueue();
  private readonly callerEvents = new EventEmitter();
  private readonly lineEvents = new EventEmitter();
  private timer: NodeJS.Timeout | null = null;
  private elapsedMs = 0;
  private ended = false;
  /** What each side actually heard, frame by frame (for the WAV recording). */
  readonly heardByCallee: Buffer[] = [];
  readonly heardByCaller: Buffer[] = [];

  /** CallBridge's end of the line: the same interface as a Twilio media stream. */
  readonly callerEnd: MediaTransport;

  constructor(private readonly frameIntervalMs = FRAME_MS) {
    const line = this;
    this.callerEnd = {
      sendAudio: (b64) => line.toCallee.push(Buffer.from(b64, 'base64')),
      sendMark: (name) => line.toCallee.pushMark(name),
      clearAudio: () => {
        // Twilio echoes the marks of audio it discards.
        for (const name of line.toCallee.clear()) line.callerEvents.emit('mark', name);
      },
      on: <E extends keyof MediaTransportEvents>(event: E, listener: MediaTransportEvents[E]) => {
        line.callerEvents.on(event, listener as (...args: unknown[]) => void);
      },
      close: () => line.hangup('caller'),
    };
  }

  /** The simulated business speaks (base64 μ-law). */
  calleeSend(b64: string) {
    this.toCaller.push(Buffer.from(b64, 'base64'));
  }

  /** The simulated business stops talking mid-sentence (it was interrupted). */
  calleeClear() {
    this.toCaller.clear();
  }

  /** How much of the business's speech is still waiting to be played, in ms. */
  get calleePendingMs() {
    return this.toCaller.pendingMs;
  }

  get isEnded() {
    return this.ended;
  }

  get elapsed() {
    return this.elapsedMs;
  }

  /** Audio arriving at the simulated business, one 20 ms frame at a time (base64 μ-law). */
  onCalleeAudio(fn: (b64: string) => void) {
    this.lineEvents.on('calleeAudio', fn);
  }

  onHangup(fn: (by: HangupBy) => void) {
    this.lineEvents.on('hangup', fn);
  }

  start() {
    if (this.timer || this.ended) return;
    this.timer = setInterval(() => this.tick(), this.frameIntervalMs);
  }

  /** Advance the line by one 20 ms frame (exposed for tests). */
  tick() {
    if (this.ended) return;
    const out = this.toCallee.nextFrame();
    this.heardByCallee.push(out.frame);
    this.lineEvents.emit('calleeAudio', out.frame.toString('base64'));
    for (const name of out.marks) this.callerEvents.emit('mark', name);

    const back = this.toCaller.nextFrame();
    this.heardByCaller.push(back.frame);
    this.callerEvents.emit('audio', back.frame.toString('base64'), this.elapsedMs);
    this.elapsedMs += FRAME_MS;
  }

  hangup(by: HangupBy) {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.callerEvents.emit('stop');
    this.lineEvents.emit('hangup', by);
  }

  /** Everything each side heard, as continuous μ-law (same length). */
  recording(): { caller: Buffer; callee: Buffer } {
    return { caller: Buffer.concat(this.heardByCaller), callee: Buffer.concat(this.heardByCallee) };
  }
}
