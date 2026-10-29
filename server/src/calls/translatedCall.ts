import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { TranslatedCallRecord } from '../../../shared/types';
import { languageCode } from '../../../shared/languages';
import { mixFrame, OverlayQueue, ulawDecode, ulawEncode } from '../audio/pcm';
import type { LiveTranslationEvents } from '../providers/translation/liveTranslation';
import { SPOKEN_OUTPUT_LANGUAGES } from '../providers/translation/liveTranslation';
import type { MediaTransport, TelephonyCallState, TelephonyProvider } from '../providers/telephony/types';
import { CaptionTrack } from './captions';

/**
 * A call the user makes themselves, with translation. The user's leg (the app, or their phone
 * ringing first) connects, then the other number is dialed, and the server relays audio between
 * the two. Captions translate both sides on the user's screen. When the user adds the
 * interpreter (after asking the other side), it announces itself to both and its translated
 * speech is mixed into each line, with the original voice turned down beneath it.
 */

/** One direction of translation (see LiveTranslation). */
export interface TranslationStream {
  connect(): Promise<void>;
  sendAudio(ulawB64: string): void;
  on<E extends keyof LiveTranslationEvents>(event: E, listener: LiveTranslationEvents[E]): void;
  close(): void;
}

export interface TranslatedCallDeps {
  telephony: TelephonyProvider;
  /** A translation stream into `targetLanguage` (ISO 639-1). */
  createTranslation: (targetLanguage: string) => TranslationStream;
  /** Spoken announcement audio (8 kHz PCM) in a language, or null if it can't be made. */
  speak: (text: string, languageCode: string) => Promise<Int16Array | null>;
  maxCallSeconds: number;
  /** The user's phone, rung when they join by phone. */
  userPhone?: string;
  /** Caller ID for the other side (the user's verified number), else the service number. */
  callerId?: string;
  userName: string;
  log: (callId: string, type: string, detail?: string) => void;
  onChange: (record: TranslatedCallRecord) => void;
  onFinished: (record: TranslatedCallRecord) => void;
}

/** How long the user's leg has to connect, and how long the other side may ring. */
const JOIN_TIMEOUT_MS = 45_000;
const FRAME_SAMPLES = 160;

/** What the interpreter says when it joins, to each side in their language. */
const ANNOUNCEMENTS: Record<string, (name: string) => string> = {
  en: (n) => `An AI interpreter has joined the call to translate between you and ${n}. There may be a short delay.`,
  zh: (n) => `AI 翻译已加入通话，为您和${n}翻译。可能会有短暂延迟。`,
  ja: (n) => `AI通訳が通話に参加しました。${n}さんとの会話を通訳します。少し遅れることがあります。`,
  ko: (n) => `AI 통역사가 통화에 참여해 ${n} 님과의 대화를 통역합니다. 약간 지연될 수 있습니다.`,
  es: (n) => `Un intérprete de IA se ha unido a la llamada para traducir entre usted y ${n}. Puede haber un breve retraso.`,
  pt: (n) => `Um intérprete de IA entrou na chamada para traduzir entre você e ${n}. Pode haver um pequeno atraso.`,
  fr: (n) => `Un interprète IA a rejoint l'appel pour traduire entre vous et ${n}. Il peut y avoir un léger délai.`,
  de: (n) => `Ein KI-Dolmetscher ist dem Anruf beigetreten und übersetzt zwischen Ihnen und ${n}. Es kann eine kurze Verzögerung geben.`,
  it: (n) => `Un interprete IA si è unito alla chiamata per tradurre tra lei e ${n}. Potrebbe esserci un breve ritardo.`,
  ru: (n) => `К звонку подключился ИИ-переводчик, чтобы переводить ваш разговор с ${n}. Возможна небольшая задержка.`,
  hi: (n) => `एक AI दुभाषिया कॉल में जुड़ गया है, जो आपके और ${n} के बीच अनुवाद करेगा। थोड़ी देरी हो सकती है।`,
  id: (n) => `Penerjemah AI telah bergabung untuk menerjemahkan antara Anda dan ${n}. Mungkin ada sedikit jeda.`,
  vi: (n) => `Một phiên dịch viên AI đã tham gia cuộc gọi để dịch giữa bạn và ${n}. Có thể có độ trễ ngắn.`,
};

/** "Ask for me": the consent question, spoken to the other side in their language. */
const CONSENT_QUESTIONS: Record<string, (name: string) => string> = {
  en: (n) => `${n} would like an AI interpreter to join this call and translate. Is that OK with you?`,
  zh: (n) => `${n}希望让 AI 翻译加入通话帮忙翻译，您同意吗？`,
  ja: (n) => `${n}さんがAI通訳をこの通話に入れて通訳したいそうです。よろしいですか？`,
  ko: (n) => `${n} 님이 AI 통역사를 통화에 참여시켜 통역하고 싶어 합니다. 괜찮으신가요?`,
  es: (n) => `${n} quisiera que un intérprete de IA se una a la llamada para traducir. ¿Le parece bien?`,
  pt: (n) => `${n} gostaria que um intérprete de IA entrasse na chamada para traduzir. Tudo bem para você?`,
  fr: (n) => `${n} aimerait qu'un interprète IA rejoigne l'appel pour traduire. Êtes-vous d'accord ?`,
  de: (n) => `${n} möchte, dass ein KI-Dolmetscher dem Anruf beitritt und übersetzt. Sind Sie einverstanden?`,
  it: (n) => `${n} vorrebbe che un interprete IA si unisse alla chiamata per tradurre. Le va bene?`,
  ru: (n) => `${n} хотел бы подключить к звонку ИИ-переводчика. Вы не против?`,
  hi: (n) => `${n} चाहते हैं कि अनुवाद के लिए एक AI दुभाषिया कॉल में जुड़े। क्या यह ठीक है?`,
  id: (n) => `${n} ingin penerjemah AI bergabung untuk menerjemahkan. Apakah Anda setuju?`,
  vi: (n) => `${n} muốn một phiên dịch viên AI tham gia cuộc gọi để dịch. Bạn có đồng ý không?`,
};

/** US ringback (440 + 480 Hz, 2 s on, 4 s off) for the user while the other side rings. */
function ringbackFrame(frame: number): Buffer {
  const samples = new Int16Array(FRAME_SAMPLES);
  const t0 = frame * FRAME_SAMPLES;
  const on = (t0 / 8000) % 6 < 2;
  if (on) {
    for (let i = 0; i < FRAME_SAMPLES; i++) {
      const t = (t0 + i) / 8000;
      samples[i] = Math.round(2500 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)));
    }
  }
  return ulawEncode(samples);
}

export class TranslatedCall {
  readonly userToken = randomBytes(24).toString('hex');
  readonly themToken = randomBytes(24).toString('hex');
  private appJoinCode: string | null = null;
  private userLegId: string | null = null;
  private themCallId: string | null = null;
  private you: MediaTransport | null = null;
  private them: MediaTransport | null = null;
  /** Translated speech waiting to be mixed into each person's line. */
  private readonly toThem = new OverlayQueue();
  private readonly toYou = new OverlayQueue();
  private youToThem: TranslationStream | null = null;
  private themToYou: TranslationStream | null = null;
  private readonly yourCaptions: CaptionTrack;
  private readonly theirCaptions: CaptionTrack;
  private ringback: NodeJS.Timeout | undefined;
  private readonly timers = new Set<NodeJS.Timeout>();
  private finished = false;

  constructor(
    readonly record: TranslatedCallRecord,
    private readonly deps: TranslatedCallDeps,
  ) {
    const changed = () => this.changed();
    const upsert = (line: TranslatedCallRecord['lines'][number]) => {
      if (!this.record.lines.includes(line)) this.record.lines.push(line);
      changed();
    };
    this.yourCaptions = new CaptionTrack('you', upsert);
    this.theirCaptions = new CaptionTrack('them', upsert);
  }

  get id() {
    return this.record.id;
  }

  get done() {
    return this.finished;
  }

  private log(type: string, detail?: string) {
    this.deps.log(this.id, type, detail);
  }

  private changed() {
    this.deps.onChange(this.record);
  }

  private timer(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  // ───────────────────────────── connecting ─────────────────────────────

  /** Rings the user's phone, or waits for the app to connect (returns its one-time join code). */
  async start(): Promise<{ code?: string }> {
    this.timer(JOIN_TIMEOUT_MS, () => {
      if (!this.you) this.end("You didn't connect to the call.");
    });
    if (this.record.request.join === 'app') {
      this.appJoinCode = randomBytes(16).toString('hex');
      return { code: this.appJoinCode };
    }
    if (!this.deps.telephony.placeUserLeg || !this.deps.userPhone) {
      this.end("Can't ring your phone with this setup.");
      return {};
    }
    try {
      const { providerCallId } = await this.deps.telephony.placeUserLeg({
        callId: this.id,
        to: this.deps.userPhone,
        streamToken: this.userToken,
        maxDurationSeconds: this.deps.maxCallSeconds,
      });
      this.userLegId = providerCallId;
      this.log('you.ringing');
    } catch (err) {
      this.end(`Couldn't ring your phone: ${(err as Error).message}`);
    }
    return {};
  }

  /** The app's voice leg reached our webhook: the stream token, if its code is right. */
  appJoinStream(code: string, legSid: string | undefined): string | null {
    const expected = this.appJoinCode;
    if (!expected || code.length !== expected.length || !timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return null;
    this.appJoinCode = null;
    if (legSid) this.userLegId = legSid;
    return this.userToken;
  }

  /** The user is on: dial the other side, with ringback in their ear meanwhile. */
  attachUserMedia(transport: MediaTransport) {
    if (this.finished || this.you) {
      transport.close();
      return;
    }
    this.you = transport;
    this.log('you.connected');
    transport.on('audio', (payload) => {
      if (this.them) this.them.sendAudio(mixFrame(Buffer.from(payload, 'base64'), this.toThem.take(FRAME_SAMPLES)).toString('base64'));
      this.youToThem?.sendAudio(payload);
    });
    transport.on('stop', () => this.end('You hung up.'));
    void this.dial();
  }

  private async dial() {
    this.record.status = 'dialing';
    this.changed();
    let frame = 0;
    this.ringback = setInterval(() => this.you?.sendAudio(ringbackFrame(frame++).toString('base64')), 20);
    try {
      const { providerCallId } = await this.deps.telephony.placeCall({
        callId: this.id,
        to: this.record.request.to,
        ...(this.deps.callerId ? { from: this.deps.callerId } : {}),
        streamToken: this.themToken,
        maxDurationSeconds: this.deps.maxCallSeconds,
      });
      this.themCallId = providerCallId;
      this.log('them.dialing', providerCallId);
      this.timer((this.deps.maxCallSeconds + 90) * 1000, () => this.end('The call reached its time limit.'));
    } catch (err) {
      this.end(`Couldn't place the call: ${(err as Error).message}`);
    }
  }

  /** The other side answered: from now on audio flows between the two of them. */
  attachMedia(transport: MediaTransport) {
    if (this.finished || this.them) {
      transport.close();
      return;
    }
    this.stopRingback();
    this.you?.clearAudio();
    this.them = transport;
    this.record.status = 'live';
    this.record.answeredAt = Date.now();
    this.log('them.answered');
    this.changed();
    transport.on('audio', (payload) => {
      this.you?.sendAudio(mixFrame(Buffer.from(payload, 'base64'), this.toYou.take(FRAME_SAMPLES)).toString('base64'));
      this.themToYou?.sendAudio(payload);
    });
    transport.on('stop', () => this.end('They hung up.'));
    if (this.record.captions) void this.startTranslations();
  }

  handleTelephonyState(state: TelephonyCallState) {
    if (this.finished) return;
    this.log('them.status', state);
    if (state === 'completed') this.end(this.them ? 'They hung up.' : 'The call ended.');
    else if (state === 'busy') this.end('The line was busy.');
    else if (state === 'no_answer') this.end('No one answered.');
    else if (state === 'failed' || state === 'canceled') this.end("The call couldn't go through.");
  }

  handleUserLegState(state: TelephonyCallState) {
    if (this.finished) return;
    this.log('you.status', state);
    if (state === 'completed') this.end('You hung up.');
    else if (state === 'busy' || state === 'no_answer' || state === 'failed' || state === 'canceled') this.end("You didn't pick up.");
  }

  // ───────────────────────────── translation ─────────────────────────────

  setCaptions(on: boolean): string | null {
    if (this.finished) return 'The call has ended.';
    this.record.captions = on;
    this.changed();
    if (on) void this.startTranslations();
    else if (this.record.interpreter === 'off') this.stopTranslations();
    return null;
  }

  /** Adds the interpreter (it introduces itself to both sides first) or removes it. */
  async setInterpreter(on: boolean): Promise<string | null> {
    if (this.finished) return 'The call has ended.';
    if (!on) {
      this.record.interpreter = 'off';
      this.toThem.clear();
      this.toYou.clear();
      this.log('interpreter.off');
      this.changed();
      if (!this.record.captions) this.stopTranslations();
      return null;
    }
    if (!this.them || !this.you) return "The call isn't connected yet.";
    if (this.record.interpreter !== 'off') return null;
    const unspoken = [this.record.request.theirLanguage, this.record.userLanguage].filter((l) => !SPOKEN_OUTPUT_LANGUAGES.has(languageCode(l) ?? ''));
    if (unspoken.length) return `The interpreter can't speak ${unspoken.join(' or ')} yet. Captions still translate.`;
    this.record.interpreter = 'joining';
    this.changed();
    this.log('interpreter.joining');
    const translating = this.startTranslations();
    const theirCode = languageCode(this.record.request.theirLanguage) ?? 'en';
    const yourCode = languageCode(this.record.userLanguage) ?? 'en';
    const say = (code: string, name: string) => (ANNOUNCEMENTS[code] ?? ANNOUNCEMENTS.en!)(name);
    const [toThem, toYou] = await Promise.all([
      this.deps.speak(say(theirCode, this.deps.userName || 'the caller'), theirCode).catch(() => null),
      this.deps.speak(say(yourCode, this.record.request.contactName || 'them'), yourCode).catch(() => null),
    ]);
    await translating;
    if (this.finished || this.record.interpreter !== 'joining') return null;
    if (toThem) this.toThem.push(toThem);
    if (toYou) this.toYou.push(toYou);
    this.record.interpreter = 'on';
    this.record.interpreterUsed = true;
    this.log('interpreter.on');
    this.changed();
    return null;
  }

  /**
   * "Ask for me": the consent question, spoken into the call in their language (the user hears
   * it too). Their answer shows in the captions; adding the interpreter is still the user's tap.
   */
  async askConsent(): Promise<string | null> {
    if (this.finished) return 'The call has ended.';
    if (!this.them || !this.you) return "The call isn't connected yet.";
    const code = languageCode(this.record.request.theirLanguage) ?? 'en';
    const text = (CONSENT_QUESTIONS[code] ?? CONSENT_QUESTIONS.en!)(this.deps.userName || 'The caller');
    const audio = await this.deps.speak(text, code).catch(() => null);
    if (!audio) return "Couldn't ask right now. Ask them yourself.";
    if (this.finished) return null;
    this.toThem.push(audio);
    this.toYou.push(audio);
    this.log('interpreter.asked', code);
    return null;
  }

  private async startTranslations() {
    const tasks: Promise<void>[] = [];
    if (!this.youToThem) tasks.push(this.openDirection('you'));
    if (!this.themToYou) tasks.push(this.openDirection('them'));
    await Promise.all(tasks);
  }

  /** Translation of what `speaker` says, into the other person's language. */
  private async openDirection(speaker: 'you' | 'them') {
    const target = speaker === 'you' ? this.record.request.theirLanguage : this.record.userLanguage;
    const code = languageCode(target);
    if (!code) {
      this.note(`Translation into ${target} isn't available.`);
      return;
    }
    const stream = this.deps.createTranslation(code);
    const captions = speaker === 'you' ? this.yourCaptions : this.theirCaptions;
    const overlay = speaker === 'you' ? this.toThem : this.toYou;
    if (speaker === 'you') this.youToThem = stream;
    else this.themToYou = stream;
    stream.on('source', (d) => captions.source(d));
    stream.on('translation', (d) => captions.translation(d));
    stream.on('audio', (b64) => {
      if (this.record.interpreter === 'on') overlay.push(ulawDecode(Buffer.from(b64, 'base64')));
    });
    stream.on('failure', (message, fatal) => {
      this.log(`translation.${speaker}.${fatal ? 'fatal' : 'error'}`, message);
      if (fatal) this.dropDirection(speaker, `Translation stopped: ${message}`);
    });
    try {
      await stream.connect();
      this.log(`translation.${speaker}.connected`, code);
    } catch (err) {
      this.log(`translation.${speaker}.failed`, (err as Error).message);
      this.dropDirection(speaker, `Couldn't start translation into ${target}: ${(err as Error).message}`);
    }
  }

  private dropDirection(speaker: 'you' | 'them', why: string) {
    const stream = speaker === 'you' ? this.youToThem : this.themToYou;
    stream?.close();
    if (speaker === 'you') this.youToThem = null;
    else this.themToYou = null;
    if (!this.finished) this.note(why);
  }

  private stopTranslations() {
    this.youToThem?.close();
    this.themToYou?.close();
    this.youToThem = null;
    this.themToYou = null;
    this.log('translation.stopped');
  }

  private note(text: string) {
    this.record.notice = text;
    this.changed();
  }

  // ───────────────────────────── ending ─────────────────────────────

  /** The user tapped End call. */
  endByUser() {
    this.end('You ended the call.');
  }

  private stopRingback() {
    if (this.ringback) clearInterval(this.ringback);
    this.ringback = undefined;
  }

  private end(why: string) {
    if (this.finished) return;
    this.finished = true;
    this.log('call.ended', why);
    this.stopRingback();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.stopTranslations();
    this.yourCaptions.close();
    this.theirCaptions.close();
    for (const leg of [this.themCallId, this.userLegId]) {
      if (leg) this.deps.telephony.hangup(leg).catch((err) => this.log('hangup.error', (err as Error).message));
    }
    this.you?.close();
    this.them?.close();
    this.record.interpreter = 'off';
    this.record.endedAt = Date.now();
    const failed = !this.record.answeredAt;
    this.record.status = failed ? 'failed' : 'ended';
    if (failed) this.record.failureReason = why;
    this.changed();
    this.deps.onFinished(this.record);
  }
}
