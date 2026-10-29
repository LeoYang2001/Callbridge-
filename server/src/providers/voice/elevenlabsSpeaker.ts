/**
 * Speaks the realtime model's text with an ElevenLabs voice, streamed as G.711 μ-law 8 kHz so
 * the audio goes to Twilio byte-for-byte. Lets each call language use a native speaker's voice
 * instead of one OpenAI voice speaking every language with the same accent.
 *
 * Text arrives as deltas; each finished sentence is sent as its own streaming request (started
 * at once, so the next sentence is ready when the current one ends) and played in order.
 */

export interface SpeakerOptions {
  apiKey: string;
  voiceId: string;
  /** e.g. eleven_flash_v2_5 (fast, 32 languages including Filipino). */
  model: string;
  /** ISO 639 code that pins the language; dropped if ElevenLabs rejects it. */
  languageCode?: string;
  fetch?: typeof fetch;
}

export interface SpeakerEvents {
  audio: (itemId: string, payloadB64: string) => void;
  /** Everything written so far has been sent. */
  idle: () => void;
  failure: (message: string, fatal: boolean) => void;
}

interface Sentence {
  text: string;
  /** Audio streamed so far, in ms (μ-law 8 kHz: 8 bytes per ms). */
  ms: number;
  done: boolean;
}

interface Job {
  itemId: string;
  sentence: Sentence;
  response: Promise<Response>;
}

/** The ELEVENLABS_VOICES key for a call language: its ISO code, or "yue" for Cantonese. */
export function voiceLanguageKey(language: string, code: string | undefined): string | undefined {
  return /cantonese|粵|粤/i.test(language) ? 'yue' : code;
}

/** ElevenLabs' code for a language key (Filipino is "fil"); none for Cantonese. */
export function elevenLabsLanguageCode(key: string | undefined): string | undefined {
  if (!key || key === 'yue') return undefined;
  return key === 'tl' ? 'fil' : key;
}

const ULAW_BYTES_PER_MS = 8;
/** Rough speaking time per character, for guessing how much of a half-played sentence was heard. */
const msPerChar = (text: string) => (/[぀-ヿ㐀-鿿가-힯]/.test(text) ? 220 : 65);

export class ElevenLabsSpeaker {
  private readonly listeners: { [E in keyof SpeakerEvents]?: SpeakerEvents[E] } = {};
  /** Text not yet cut into sentences, per item. */
  private readonly pending = new Map<string, string>();
  /** Every sentence sent for an item, for working out what the listener heard. */
  private readonly spoken = new Map<string, Sentence[]>();
  private queue: Job[] = [];
  private pumping = false;
  private controller = new AbortController();
  private sendLanguage: boolean;

  constructor(private readonly opts: SpeakerOptions) {
    this.sendLanguage = Boolean(opts.languageCode);
  }

  on<E extends keyof SpeakerEvents>(event: E, listener: SpeakerEvents[E]) {
    this.listeners[event] = listener;
  }

  /** More text for item `itemId`; whole sentences start speaking right away. */
  write(itemId: string, delta: string) {
    const [sentences, rest] = splitSentences((this.pending.get(itemId) ?? '') + delta, false);
    this.pending.set(itemId, rest);
    for (const s of sentences) this.enqueue(itemId, s);
  }

  /** The item's text is complete: speak whatever is left. */
  end(itemId: string) {
    const [sentences] = splitSentences(this.pending.get(itemId) ?? '', true);
    this.pending.delete(itemId);
    for (const s of sentences) this.enqueue(itemId, s);
    if (!this.busy()) this.listeners.idle?.();
  }

  /** Text written but not yet fully streamed. */
  busy() {
    return this.queue.length > 0 || this.pumping || [...this.pending.values()].some((t) => t.trim());
  }

  /** Stop speaking now (an interruption). What was already spoken stays known to `heardText`. */
  stop() {
    this.controller.abort();
    this.controller = new AbortController();
    this.queue = [];
    this.pending.clear();
  }

  /** The text of item `itemId` that fits in its first `ms` of audio. */
  heardText(itemId: string, ms: number): string {
    let left = ms;
    const out: string[] = [];
    for (const s of this.spoken.get(itemId) ?? []) {
      if (left <= 0) break;
      const length = s.done ? s.ms : Math.max(s.ms, s.text.length * msPerChar(s.text));
      if (left >= length) {
        out.push(s.text);
      } else {
        out.push(s.text.slice(0, Math.floor((s.text.length * left) / length)));
      }
      left -= length;
    }
    return out.join(' ').trim();
  }

  private enqueue(itemId: string, text: string) {
    const sentence: Sentence = { text, ms: 0, done: false };
    const said = this.spoken.get(itemId) ?? [];
    const previous = said.map((s) => s.text).join(' ');
    said.push(sentence);
    this.spoken.set(itemId, said);
    while (this.spoken.size > 8) this.spoken.delete(this.spoken.keys().next().value!);
    this.queue.push({ itemId, sentence, response: this.request(text, previous, this.controller.signal) });
    void this.pump();
  }

  private async request(text: string, previous: string, signal: AbortSignal): Promise<Response> {
    const doFetch = this.opts.fetch ?? fetch;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.opts.voiceId)}/stream?output_format=ulaw_8000`;
    const send = (withLanguage: boolean) =>
      doFetch(url, {
        method: 'POST',
        signal,
        headers: { 'xi-api-key': this.opts.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: this.opts.model,
          ...(previous ? { previous_text: previous } : {}),
          ...(withLanguage ? { language_code: this.opts.languageCode } : {}),
        }),
      });
    let res = await send(this.sendLanguage);
    if (this.sendLanguage && (res.status === 400 || res.status === 422)) {
      // This model doesn't take this language code; the voice and text still carry the language.
      this.sendLanguage = false;
      res = await send(false);
    }
    return res;
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const job = this.queue[0]!;
        await this.play(job);
        if (this.queue[0] === job) this.queue.shift();
      }
    } finally {
      this.pumping = false;
    }
    if (!this.busy()) this.listeners.idle?.();
  }

  private async play(job: Job) {
    try {
      const res = await job.response;
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        const fatal = res.status === 401 || res.status === 403;
        this.listeners.failure?.(`ElevenLabs text-to-speech failed (HTTP ${res.status}) ${detail.slice(0, 200)}`.trim(), fatal);
        return;
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        job.sentence.ms += value.length / ULAW_BYTES_PER_MS;
        this.listeners.audio?.(job.itemId, Buffer.from(value).toString('base64'));
      }
      job.sentence.done = true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.listeners.failure?.(`ElevenLabs text-to-speech failed: ${(err as Error).message}`, false);
    }
  }
}

const CLOSERS = `"'”’)）」』`;

/**
 * Cuts finished sentences off the front of `text`. A CJK full stop ends a sentence at once; a
 * Latin one only before whitespace (so "3.5" and a sentence still streaming stay whole). With
 * `final`, the remainder is a sentence too.
 */
export function splitSentences(text: string, final: boolean): [string[], string] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    let end = -1;
    if ('。！？'.includes(ch)) {
      end = i + 1;
    } else if ('.!?…'.includes(ch)) {
      let j = i + 1;
      while (j < text.length && '.!?…'.includes(text[j]!)) j++;
      while (j < text.length && CLOSERS.includes(text[j]!)) j++;
      if (j < text.length && /\s/.test(text[j]!)) end = j;
      else continue;
    } else if (ch === '\n') {
      end = i + 1;
    } else {
      continue;
    }
    while (end < text.length && CLOSERS.includes(text[end]!)) end++;
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
    i = end - 1;
  }
  let rest = text.slice(start);
  if (final) {
    if (rest.trim()) out.push(rest.trim());
    rest = '';
  }
  return [out, rest];
}
