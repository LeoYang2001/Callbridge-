import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { Downsampler, pcm16FromBytes, pcm16ToBytes, resampleLinear, ulawDecode, ulawEncode, Upsampler } from '../../audio/pcm';

/**
 * One direction of a translated call: a caller's phone audio goes in, and OpenAI's realtime
 * translation model (gpt-realtime-translate) streams back the translation as speech and text,
 * plus a transcript of what was said. It translates continuously while the person talks.
 *
 * The model takes 24 kHz PCM in 200 ms frames; phone audio is 8 kHz μ-law, so audio is converted
 * both ways here and the rest of the call only sees μ-law.
 */

/** Languages the translation model can speak (it understands many more). */
export const SPOKEN_OUTPUT_LANGUAGES = new Set(['en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'zh', 'ja', 'ko', 'hi', 'id', 'vi']);

export interface LiveTranslationOptions {
  apiKey: string;
  model: string;
  /** ISO 639-1 code of the language to translate into. */
  targetLanguage: string;
  /** Model for the transcript of what was said (in the speaker's language). */
  transcriptionModel: string;
  /** For tests. */
  connect?: (url: string, headers: Record<string, string>) => WebSocket;
}

export interface LiveTranslationEvents {
  /** Translated speech for the listener, base64 μ-law 8 kHz. */
  audio: (ulawB64: string) => void;
  /** More of what the speaker said, in their language (append-only text). */
  source: (delta: string) => void;
  /** More of the translation (append-only text). */
  translation: (delta: string) => void;
  failure: (message: string, fatal: boolean) => void;
  closed: () => void;
}

/** 200 ms of 24 kHz audio: the model's frame. */
const FRAME_SAMPLES = 4800;

export class LiveTranslation {
  private ws: WebSocket | null = null;
  private readonly emitter = new EventEmitter();
  private readonly up = new Upsampler();
  private readonly down = new Downsampler();
  private pending: Int16Array[] = [];
  private pendingSamples = 0;
  private ready = false;
  private closing = false;

  constructor(private readonly opts: LiveTranslationOptions) {}

  on<E extends keyof LiveTranslationEvents>(event: E, listener: LiveTranslationEvents[E]) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  connect(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime/translations?model=${encodeURIComponent(this.opts.model)}`;
    const headers = { Authorization: `Bearer ${this.opts.apiKey}` };
    const ws = this.opts.connect ? this.opts.connect(url, headers) : new WebSocket(url, { headers });
    this.ws = ws;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to OpenAI translation')), 15_000);
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              audio: {
                input: { transcription: { model: this.opts.transcriptionModel }, noise_reduction: { type: 'near_field' } },
                output: { language: this.opts.targetLanguage },
              },
            },
          }),
        );
      });
      ws.on('message', (raw) => {
        let ev: any;
        try {
          ev = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (ev.type === 'session.updated' && !this.ready) {
          this.ready = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        if (ev.type === 'error' && !this.ready) {
          clearTimeout(timer);
          reject(new Error(ev.error?.message ?? 'OpenAI translation error'));
          return;
        }
        this.handle(ev);
      });
      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(timer);
        reject(new Error(`OpenAI translation refused the connection (HTTP ${res.statusCode}). Check OPENAI_API_KEY and access to ${this.opts.model}.`));
        ws.terminate();
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        if (!this.ready) reject(err);
        else this.emitter.emit('failure', err.message, true);
      });
      ws.on('close', () => {
        clearTimeout(timer);
        if (!this.ready) reject(new Error('OpenAI translation closed before it was ready'));
        else if (!this.closing) this.emitter.emit('failure', 'Translation connection closed', true);
        this.emitter.emit('closed');
      });
    });
  }

  private handle(ev: any) {
    switch (ev.type) {
      case 'session.output_audio.delta': {
        if (!ev.delta) break;
        let pcm = pcm16FromBytes(Buffer.from(ev.delta, 'base64'));
        const rate = ev.sample_rate ?? 24000;
        if (rate !== 24000) pcm = resampleLinear(pcm, rate, 24000);
        const phone = this.down.process(pcm);
        if (phone.length) this.emitter.emit('audio', ulawEncode(phone).toString('base64'));
        break;
      }
      case 'session.input_transcript.delta':
        if (ev.delta) this.emitter.emit('source', ev.delta);
        break;
      case 'session.output_transcript.delta':
        if (ev.delta) this.emitter.emit('translation', ev.delta);
        break;
      case 'error':
        this.emitter.emit('failure', ev.error?.message ?? 'Unknown translation error', false);
        break;
    }
  }

  /** One frame of the speaker's phone audio (base64 μ-law). Keep sending, silence included. */
  sendAudio(ulawB64: string) {
    if (!this.ready || this.closing) return;
    const pcm = this.up.process(ulawDecode(Buffer.from(ulawB64, 'base64')));
    this.pending.push(pcm);
    this.pendingSamples += pcm.length;
    if (this.pendingSamples < FRAME_SAMPLES) return;
    const frame = new Int16Array(this.pendingSamples);
    let at = 0;
    for (const p of this.pending) {
      frame.set(p, at);
      at += p.length;
    }
    this.pending = [];
    this.pendingSamples = 0;
    this.send({ type: 'session.input_audio_buffer.append', audio: pcm16ToBytes(frame).toString('base64') });
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.send({ type: 'session.close' });
    const ws = this.ws;
    // The server flushes the last translation and closes; don't wait for it forever.
    setTimeout(() => ws?.readyState === WebSocket.OPEN && ws.close(), 3000).unref?.();
  }
}
