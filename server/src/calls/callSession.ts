import { randomBytes, randomUUID } from 'node:crypto';
import type { CallRecord, CallResult, CallStatus, Speaker, UserAnswer, UserQuestion } from '../../../shared/types';
import { buildInstructions, INTRO_NUDGE } from '../agent/prompt';
import { executeTool, TOOL_DEFINITIONS } from '../agent/tools';
import { PolicyEngine, type AskUser } from '../policy/policyEngine';
import type { CallAnalyzer, TranscriptAnalysis } from '../providers/analysis/types';
import type { MediaTransport, TelephonyCallState, TelephonyProvider } from '../providers/telephony/types';
import type { Translator } from '../providers/translation/openaiTranslator';
import type { VoiceAgent } from '../providers/voice/types';
import { localToday } from '../util/time';
import { languageCode } from '../../../shared/languages';
import { SpeechGate } from './speechGate';
import type { CallStore } from './store';

export interface CallSessionDeps {
  store: CallStore;
  telephony: TelephonyProvider;
  createAgent: (voice?: string) => VoiceAgent;
  /** Live transcript translation into the user's language; null disables it. */
  translator?: Translator | null;
  analyzer: CallAnalyzer | null;
  maxCallSeconds: number;
  introDelayMs: number;
  /** How long the other party is kept on hold while the user answers a question. */
  holdTimeoutMs?: number;
  /** How often the assistant thanks them for holding (default 20 s). */
  holdCheckInMs?: number;
  log: (callId: string, type: string, detail?: string) => void;
  /**
   * The assistant put a question to the user (e.g. to send a push notification). Called once per
   * question, after its translation into the user's language, or without it if that's slow.
   */
  onQuestion?: (callId: string, question: UserQuestion) => void;
  /** Called exactly once, when the session is fully finished. */
  onFinished: (callId: string) => void;
}

const TERMINAL_FAILURES: Partial<Record<TelephonyCallState, CallResult['status']>> = {
  busy: 'busy',
  no_answer: 'no_answer',
  failed: 'failed',
  canceled: 'canceled',
};

/** μ-law at 8 kHz: one byte per sample → 8 bytes per millisecond. */
const ULAW_BYTES_PER_MS = 8;

/**
 * Live audio for the user's app: "them" is the other party (as Twilio sends it), "ai" is what
 * the assistant says (sent in bursts, faster than real time), "clear" drops queued AI audio after
 * an interruption, "end" when the call is over. Audio is base64 G.711 μ-law, 8 kHz.
 */
export type ListenEvent = { t: 'them' | 'ai'; a: string } | { t: 'clear' | 'end' };

/** Default hold while the user answers a question in the app. */
const DEFAULT_HOLD_MS = 60_000;
/** How long a question's notification waits for its translation. */
const QUESTION_NOTIFY_WAIT_MS = 2500;
/** While they hold, check in this often so the silence doesn't make them hang up. */
const HOLD_CHECKIN_MS = 20_000;

/** Sustained speech (within the last BARGE_IN_WINDOW_MS) that counts as interrupting us. */
const BARGE_IN_SPEECH_MS = 400;
const BARGE_IN_WINDOW_MS = 700;
/** How long after the model notices speech we keep checking whether it's a real interruption. */
const BARGE_IN_WATCH_MS = 2500;
const BARGE_IN_POLL_MS = 50;
/** A turn with less speech than this waits for its transcript before getting an answer. */
const MIN_TURN_SPEECH_MS = 160;
/** Speech just before the model's speech-started event that still belongs to the turn. */
const TURN_LEAD_IN_MS = 300;

const sameLanguage = (a: string, b: string) => (languageCode(a) ?? a.toLowerCase()) === (languageCode(b) ?? b.toLowerCase());
const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);
/** Acknowledgments that mean "I'm listening", in the languages the app offers. */
const BACKCHANNELS = new Set([
  'ok', 'okay', 'mm', 'mmm', 'hm', 'hmm', 'mhm', 'mmhmm', 'uhhuh', 'uh', 'huh', 'yeah', 'yep', 'yes', 'right', 'sure', 'alright', 'gotcha', 'cool',
  '嗯', '嗯嗯', '好', '好的', '对', '对对', '是', '是的', '哦', '噢', '行',
  'はい', 'ええ', 'うん', 'そう', 'そうですか', 'なるほど', 'ああ', 'あー',
  'sí', 'si', 'claro', 'vale', 'ajá', 'oui', 'ja', '네', '예', '응', 'vâng', 'dạ', 'oo', 'opo', 'да', 'ага',
]);
/** Only acknowledgments ("okay", "mm-hm", "嗯", "はい"); anything else (a greeting, a question) deserves an answer. */
const isBackchannel = (text: string) => {
  const tokens = text.toLowerCase().split(/[\s\p{P}]+/u).filter(Boolean);
  return tokens.length > 0 && tokens.length <= 3 && tokens.every((t) => BACKCHANNELS.has(t.replace(/-/g, '')));
};
const b64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/**
 * Orchestrates one phone call: telephony ↔ voice agent audio bridge, barge-in, tool calls into
 * the policy engine, hangup, and post-call result assembly.
 */
export class CallSession {
  readonly streamToken = randomBytes(24).toString('hex');
  private readonly policy: PolicyEngine;
  private agent: VoiceAgent | null = null;
  private transport: MediaTransport | null = null;

  // Playback tracking for barge-in. Times are on the media stream's clock.
  private latestMediaTs = 0;
  private currentItemId: string | null = null;
  private currentItemStartTs = 0;
  private currentItemSentMs = 0;
  /** Outbound audio chunks sent but not yet played, per assistant item (Twilio echoes marks). */
  private readonly unplayed = new Map<string, number>();

  // Turn-taking. The model detects turns; this session decides whether a turn interrupts us and
  // whether it gets an answer, using the speech gate's measurement of the actual phone audio.
  private readonly gate = new SpeechGate();
  /** The model is producing a response (asked for, until responseDone). */
  private responding = false;
  private turnActive = false;
  private turnStartTs = 0;
  /** Media time when their previous turn ended; a turn's speech is only counted after it. */
  private lastTurnEndTs = 0;
  /** The current turn was a confirmed interruption. */
  private bargedIn = false;
  private bargeWatch: NodeJS.Timeout | undefined;
  /** How the last finished turn was handled, applied to its transcript when it arrives. */
  private lastTurn: 'held' | 'quiet' | null = null;
  private readonly turnByItem = new Map<string, 'held' | 'quiet'>();
  private readonly cancelledItems = new Set<string>();
  /** Apps listening to the call live (μ-law audio, both sides). */
  private readonly listeners = new Set<(event: ListenEvent) => void>();
  /** Words they said while we kept talking; answered once we finish. */
  private heldText: string | null = null;

  private answered = false;
  private counterpartSpoke = false;
  private speechStoppedAt: number | null = null;
  private hangupRequested = false;
  private lastTelephonyState: TelephonyCallState | null = null;
  private awaitingResponseDone = false;
  private hungUp = false;
  private finalizing = false;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    readonly id: string,
    private readonly deps: CallSessionDeps,
  ) {
    const r = this.record;
    this.policy = new PolicyEngine(r.request, localToday(r.request.timezone).date);
  }

  private get record(): CallRecord {
    const r = this.deps.store.get(this.id);
    if (!r) throw new Error(`Call ${this.id} not found`);
    return r;
  }

  private update(mutate: (r: CallRecord) => void) {
    this.deps.store.update(this.id, mutate);
  }

  private log(type: string, detail?: string) {
    this.deps.log(this.id, type, detail);
  }

  private setStatus(status: CallStatus) {
    if (this.record.status === status) return;
    this.update((r) => (r.status = status));
    this.log('call.status', status);
  }

  private timer(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  private clearTimer(t: NodeJS.Timeout | undefined) {
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(t);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async start() {
    try {
      this.setStatus('preparing');
      const r = this.record;
      const instructions = buildInstructions(r.request, { today: localToday(r.request.timezone) });

      // Connect the voice model before dialing so it is ready the instant the call is answered.
      const agent = this.deps.createAgent(r.request.voice);
      this.agent = agent;
      this.wireAgent(agent);
      const t0 = Date.now();
      await agent.connect({ instructions, tools: TOOL_DEFINITIONS, transcriptionLanguage: languageCode(r.request.callLanguage) });
      this.log('ai.connected', `${Date.now() - t0}ms`);
      if (this.finalizing) return;

      this.setStatus('dialing');
      const { providerCallId } = await this.deps.telephony.placeCall({
        callId: this.id,
        to: r.request.to,
        streamToken: this.streamToken,
        maxDurationSeconds: this.deps.maxCallSeconds,
      });
      this.update((rec) => {
        rec.providerCallId = providerCallId;
        rec.metrics.dialedAt = Date.now();
      });
      this.log('telephony.call_created', providerCallId);
      this.pollCallState(providerCallId);

      // Hard stop in case every other signal is lost (ring time + talk time + margin).
      this.timer((this.deps.maxCallSeconds + 90) * 1000, () => {
        this.log('call.timeout', 'maximum duration reached');
        this.endWith('max_duration_reached');
      });
    } catch (err) {
      this.fail(`Could not start call: ${(err as Error).message}`);
    }
  }

  /**
   * Safety net next to status callbacks: some accounts (e.g. Twilio's Limited trial) don't allow
   * them, and webhooks can be lost. Polls until the call ends.
   */
  private pollCallState(providerCallId: string) {
    const getState = this.deps.telephony.getCallState?.bind(this.deps.telephony);
    if (!getState) return;
    const tick = () => {
      if (this.finalizing) return;
      getState(providerCallId)
        .then((state) => state && this.handleTelephonyState(state))
        .catch(() => {})
        .finally(() => !this.finalizing && this.timer(4_000, tick));
    };
    this.timer(4_000, tick);
  }

  handleTelephonyState(state: TelephonyCallState) {
    if (state === this.lastTelephonyState) return;
    this.lastTelephonyState = state;
    this.log('telephony.status', state);
    if (state === 'answered' && !this.answered) {
      this.answered = true;
      this.update((r) => (r.metrics.answeredAt = Date.now()));
      this.setStatus('connected');
    } else if (state === 'completed') {
      this.update((r) => (r.endReason ??= 'remote_hangup'));
      void this.finalize();
    } else if (TERMINAL_FAILURES[state]) {
      if (this.answered) {
        void this.finalize();
      } else {
        void this.finalize(TERMINAL_FAILURES[state]);
      }
    }
  }

  attachMedia(transport: MediaTransport) {
    if (this.finalizing) {
      transport.close();
      return;
    }
    this.transport = transport;
    this.log('media.started');
    if (!this.answered) {
      this.answered = true;
      this.update((r) => (r.metrics.answeredAt ??= Date.now()));
      this.setStatus('connected');
    }

    transport.on('audio', (payload, ts) => {
      this.latestMediaTs = ts;
      this.gate.observe(payload, ts);
      this.emitListen({ t: 'them', a: payload });
      this.agent?.sendAudio(payload);
    });
    transport.on('mark', (itemId) => {
      const left = (this.unplayed.get(itemId) ?? 0) - 1;
      if (left > 0) this.unplayed.set(itemId, left);
      else this.unplayed.delete(itemId);
      this.maybeHangup();
      this.answerHeldTurn();
    });
    transport.on('stop', () => {
      if (this.finalizing) return;
      this.log('media.stopped');
      this.update((r) => (r.endReason ??= 'remote_hangup'));
      void this.finalize();
    });

    // Most people answer with "Hello?" — let them speak first; introduce ourselves if they don't.
    this.timer(this.deps.introDelayMs, () => {
      if (!this.counterpartSpoke && !this.finalizing) {
        this.log('ai.intro_nudge');
        this.responding = true;
        this.agent?.prompt(INTRO_NUDGE);
      }
    });
  }

  // ───────────────────────────── voice agent ─────────────────────────────

  private wireAgent(agent: VoiceAgent) {
    agent.on('audio', (itemId, payload) => {
      if (!this.transport || this.finalizing) return;
      // Audio from a response cancelled by a barge-in can still arrive; drop it.
      if (this.cancelledItems.has(itemId) || (this.bargedIn && this.turnActive)) return;
      if (itemId !== this.currentItemId) {
        this.currentItemId = itemId;
        this.currentItemStartTs = this.latestMediaTs;
        this.currentItemSentMs = 0;
        const now = Date.now();
        if (this.speechStoppedAt) {
          const latency = now - this.speechStoppedAt;
          this.update((r) => r.metrics.turnLatenciesMs.push(latency));
          this.speechStoppedAt = null;
        }
        if (!this.record.metrics.firstAssistantAudioAt) {
          this.update((r) => (r.metrics.firstAssistantAudioAt = now));
          this.setStatus('in_progress');
        }
      }
      this.transport.sendAudio(payload);
      this.emitListen({ t: 'ai', a: payload });
      this.currentItemSentMs += b64Bytes(payload) / ULAW_BYTES_PER_MS;
      this.transport.sendMark(itemId);
      this.unplayed.set(itemId, (this.unplayed.get(itemId) ?? 0) + 1);
    });

    agent.on('speechStarted', () => {
      this.counterpartSpoke = true;
      if (this.record.status === 'connected') this.setStatus('in_progress');
      this.turnActive = true;
      this.turnStartTs = this.latestMediaTs;
      this.bargedIn = false;
      if (this.aiSpeaking()) this.watchForBargeIn();
    });

    agent.on('speechStopped', () => {
      this.turnActive = false;
      this.clearTimer(this.bargeWatch);
      const voiced = this.gate.voicedMsSince(this.turnSpeechFrom());
      this.lastTurnEndTs = this.latestMediaTs;
      const detail = `${voiced}ms speech · noise floor ${this.gate.noiseFloor}`;
      if (this.aiSpeaking() && !this.bargedIn) {
        // "Okay", "mm-hm", or noise while we talk: keep going. Real words get answered after.
        this.lastTurn = 'held';
        this.log('turn.held', detail);
      } else if (voiced >= MIN_TURN_SPEECH_MS) {
        this.lastTurn = null;
        this.speechStoppedAt = Date.now();
        this.log('turn.answered', detail);
        this.respond();
      } else {
        // Too little speech to be sure; answer only if the transcript shows words.
        this.lastTurn = 'quiet';
        this.speechStoppedAt = Date.now();
        this.log('turn.quiet', detail);
      }
    });

    agent.on('utteranceStarted', (itemId, speaker) => {
      if (speaker === 'counterpart' && this.lastTurn) {
        this.turnByItem.set(itemId, this.lastTurn);
        this.lastTurn = null;
      }
      this.upsertTranscript(itemId, speaker, '', true);
    });

    agent.on('transcript', (itemId, speaker, text) => {
      const clean = text.trim();
      const turn = speaker === 'counterpart' ? this.turnByItem.get(itemId) : undefined;
      if (turn) {
        this.turnByItem.delete(itemId);
        if (turn === 'quiet' && hasWords(clean)) {
          if (this.aiSpeaking()) this.heldText = clean;
          else this.respond();
        } else if (turn === 'held' && hasWords(clean) && !isBackchannel(clean)) {
          this.heldText = clean;
          this.answerHeldTurn();
        }
      }
      if (!clean) {
        this.update((r) => (r.transcript = r.transcript.filter((t) => t.id !== itemId)));
        return;
      }
      this.upsertTranscript(itemId, speaker, clean, false);
      this.translateLine(itemId, clean);
    });

    agent.on('toolCall', (callId, name, args) => this.handleToolCall(callId, name, args));

    agent.on('responseDone', () => {
      this.awaitingResponseDone = false;
      this.responding = false;
      this.maybeHangup();
      this.answerHeldTurn();
    });

    agent.on('failure', (message, fatal) => {
      this.log(fatal ? 'ai.fatal_error' : 'ai.error', message);
      if (fatal && !this.finalizing) {
        this.update((r) => (r.failureReason = `Voice AI connection failed: ${message}`));
        this.endWith('ai_connection_lost');
      }
    });
  }

  /** Where this turn's speech starts: a little before the model noticed it, never before the last turn. */
  private turnSpeechFrom() {
    return Math.max(this.turnStartTs - TURN_LEAD_IN_MS, this.lastTurnEndTs);
  }

  /** We're talking: a response is being generated or its audio hasn't finished playing. */
  private aiSpeaking() {
    return this.responding || this.unplayed.size > 0;
  }

  private respond() {
    if (this.finalizing || this.hangupRequested) return;
    this.heldText = null;
    this.responding = true;
    this.agent?.respond();
  }

  /** Answers what they said while we were talking, once we've finished and they're not mid-turn. */
  private answerHeldTurn() {
    if (!this.heldText || this.aiSpeaking() || this.turnActive) return;
    this.log('turn.answered_after', this.heldText.slice(0, 80));
    this.speechStoppedAt = Date.now();
    this.respond();
  }

  /**
   * While we talk, the other side's speech only interrupts us once the gate confirms sustained
   * speech. A cough, a door, or "okay" shouldn't stop the assistant mid-sentence (and make it
   * start the sentence over).
   */
  private watchForBargeIn() {
    const started = Date.now();
    const check = () => {
      if (!this.turnActive || !this.aiSpeaking() || this.finalizing) return;
      const recent = this.gate.voicedMsSince(Math.max(this.latestMediaTs - BARGE_IN_WINDOW_MS, this.turnSpeechFrom()));
      if (recent >= BARGE_IN_SPEECH_MS) return this.bargeIn(recent);
      if (Date.now() - started < BARGE_IN_WATCH_MS) this.bargeWatch = this.timer(BARGE_IN_POLL_MS, check);
    };
    check();
  }

  private bargeIn(speechMs: number) {
    const agent = this.agent;
    if (!agent) return;
    this.bargedIn = true;
    agent.cancelResponse();
    const itemId = this.currentItemId;
    if (itemId) this.cancelledItems.add(itemId);
    let heardMs = 0;
    if (itemId && this.unplayed.has(itemId)) {
      heardMs = Math.min(Math.max(0, this.latestMediaTs - this.currentItemStartTs), this.currentItemSentMs);
      agent.truncate(itemId, heardMs);
      this.update((r) => {
        const entry = r.transcript.find((t) => t.id === itemId);
        if (entry) entry.interrupted = true;
      });
    }
    this.transport?.clearAudio();
    this.emitListen({ t: 'clear' });
    this.update((r) => r.metrics.interruptions++);
    this.log('ai.interrupted', `${Math.round(heardMs)}ms heard · ${speechMs}ms speech`);
    // Twilio echoes marks for cleared audio; forgetting the items makes those echoes no-ops.
    this.unplayed.clear();
    this.currentItemId = null;
  }

  // ───────────────────────────── live listening ─────────────────────────────

  /** The user's app listens to the call live. Returns a function that stops listening. */
  listen(fn: (event: ListenEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emitListen(event: ListenEvent) {
    for (const fn of this.listeners) fn(event);
  }

  // ───────────────────────────── human in the loop ─────────────────────────────

  /**
   * The user can be asked mid-call only while the other party is on the line, and never on a
   * handed-off call (the user chose not to be interrupted).
   */
  private canAskUser() {
    return this.record.request.involvement !== 'handoff' && this.answered && !this.finalizing && !this.hangupRequested;
  }

  private readonly asks = new Map<string, AskUser>();
  private readonly holdTimers = new Map<string, NodeJS.Timeout>();

  /** Puts a decision to the user in the app; the other party holds until they answer or time runs out. */
  private askUser(ask: AskUser) {
    const id = randomUUID();
    const now = Date.now();
    const holdMs = this.deps.holdTimeoutMs ?? DEFAULT_HOLD_MS;
    const question: UserQuestion = { id, askedAt: now, expiresAt: now + holdMs, status: 'pending', ...ask };
    this.asks.set(id, ask);
    this.update((r) => (r.questions ??= []).push(question));
    this.log('user.asked', `${ask.category}: ${ask.question}`);
    this.holdTimers.set(id, this.timer(holdMs, () => this.expireQuestion(id)));
    this.scheduleHoldCheckIn(id);

    let notified = false;
    const notify = () => {
      if (notified) return;
      notified = true;
      const q = this.record.questions?.find((x) => x.id === id);
      if (q?.status === 'pending') this.deps.onQuestion?.(this.id, { ...q });
    };

    const req = this.record.request;
    const to = req.user.preferredLanguage;
    if (this.deps.translator && !sameLanguage('English', to)) {
      // Someone is holding: don't wait long for the translation before telling the user.
      this.timer(QUESTION_NOTIFY_WAIT_MS, notify);
      this.deps.translator
        .translate(ask.question, to, [])
        .then((t) => this.update((r) => {
          const q = r.questions?.find((x) => x.id === id);
          if (q && t) q.questionInUserLanguage = t;
        }))
        .catch((err) => this.log('translate.error', (err as Error).message))
        .finally(notify);
    } else {
      notify();
    }
  }

  /**
   * While the other party holds, a short "thanks for holding" every so often, so silence doesn't
   * make them hang up. Skipped if someone is talking; stops once the question is settled.
   */
  private scheduleHoldCheckIn(questionId: string) {
    this.timer(this.deps.holdCheckInMs ?? HOLD_CHECKIN_MS, () => {
      const q = this.record.questions?.find((x) => x.id === questionId);
      if (!q || q.status !== 'pending' || this.finalizing) return;
      if (!this.aiSpeaking() && !this.turnActive) {
        this.log('user.hold_checkin');
        this.responding = true;
        this.agent?.prompt(
          `You're still waiting for ${this.record.request.user.name}'s answer. In one short sentence, thank them for holding and say it'll be just a moment longer. Vary the wording; don't decide anything. (This is an automatic note, not from the other party.)`,
        );
      }
      this.scheduleHoldCheckIn(questionId);
    });
  }

  /**
   * A message the user typed in the app during the call ("tell them I'll be 10 minutes late").
   * It steers the conversation; it doesn't widen what may be agreed: anything outside the limits
   * still goes through request_decision, so the user approves it on a question card.
   */
  sendUserMessage(text: string) {
    const name = this.record.request.user.name;
    this.update((r) => r.transcript.push({ id: `user-${Date.now()}`, speaker: 'system', text, at: Date.now() }));
    this.log('user.message', text);
    if (this.finalizing) return;
    this.responding = true;
    this.agent?.prompt(
      `Message from ${name}, typed in their app during this call: "${text}". Act on it when it fits the conversation (for example, pass it on or change what you ask for), within all your rules. If it would mean agreeing to something outside the limits, call request_decision so ${name} can approve it. (This message is from ${name}'s app, not from the other party.)`,
    );
  }

  /** The user's answer from the app. Returns an error message if it can't be applied. */
  answerQuestion(questionId: string, answer: UserAnswer): string | null {
    const q = this.record.questions?.find((x) => x.id === questionId);
    const ask = this.asks.get(questionId);
    if (!q || !ask) return 'That question is not part of this call.';
    if (q.status !== 'pending') return q.status === 'expired' ? 'Too late: the assistant already moved on.' : 'Already answered.';
    if (answer.decision === 'reply' && !answer.text?.trim()) return 'Type a reply first.';

    this.clearTimer(this.holdTimers.get(questionId));
    const approved = answer.decision !== 'decline';
    const text = answer.decision === 'reply' ? answer.text!.trim() : undefined;
    const decision = this.policy.applyUserAnswer(ask, approved, text);
    this.update((r) => {
      r.decisions.push(decision);
      const entry = r.questions!.find((x) => x.id === questionId)!;
      entry.status = 'answered';
      entry.answer = { ...answer, text, at: Date.now() };
    });
    this.log('user.answered', `${answer.decision}${text ? `: ${text}` : ''}`);
    if (this.finalizing) return null;

    const name = this.record.request.user.name;
    const about = `"${ask.question}"`;
    let note: string;
    if (decision.outcome !== 'authorized') {
      note = `${name} declined ${about}. Thank them for holding, politely say no to it, and continue with the rest of the task.`;
    } else if (ask.category === 'additional_cost' && ask.amountUsd !== undefined) {
      note = `${name} approved ${about}: you may now accept up to $${ask.amountUsd} in additional charges. Thank them for holding, and call confirm_agreement (with additional_cost_usd) before confirming.`;
    } else if (ask.category === 'schedule_outside_constraints' && ask.date && ask.startTime) {
      note = `${name} approved ${ask.date} at ${ask.startTime}. Thank them for holding, then call confirm_agreement for that exact time before confirming it.`;
    } else if (text) {
      note = `${name} answered ${about} with: "${text}". Thank them for holding and share that answer; you may share it from now on.`;
    } else {
      note = `${name} approved ${about}. Thank them for holding and continue; call confirm_agreement before confirming anything.`;
    }
    this.responding = true;
    this.agent?.prompt(`${note} (This message is from ${name}'s app, not from the other party.)`);
    return null;
  }

  private expireQuestion(questionId: string) {
    const q = this.record.questions?.find((x) => x.id === questionId);
    if (!q || q.status !== 'pending') return;
    this.update((r) => {
      const entry = r.questions!.find((x) => x.id === questionId)!;
      entry.status = 'expired';
      if (!r.unresolvedQuestions.includes(entry.question)) r.unresolvedQuestions.push(entry.question);
    });
    this.log('user.no_answer', q.question);
    if (this.finalizing) return;
    const name = this.record.request.user.name;
    this.responding = true;
    this.agent?.prompt(
      `${name} didn't answer in time about "${q.question}". Thank them for holding, say you couldn't reach ${name} just now and that ${name} will follow up about it, and continue without agreeing to it.`,
    );
  }

  /** Adds the user's-language version of a finished line, unless the call is in their language. */
  private translateLine(itemId: string, text: string) {
    const { translator } = this.deps;
    const req = this.record.request;
    const to = req.user.preferredLanguage;
    if (!translator || !hasWords(text) || sameLanguage(req.callLanguage, to)) return;
    const context = this.record.transcript
      .filter((t) => t.id !== itemId && !t.pending && t.text && t.speaker !== 'system')
      .slice(-2)
      .map((t) => `${t.speaker === 'assistant' ? 'AI' : 'THEM'}: ${t.text}`);
    translator
      .translate(text, to, context)
      .then((translation) => {
        if (!translation) return;
        this.update((r) => {
          const entry = r.transcript.find((t) => t.id === itemId);
          // Skip if the line changed while we were translating; its newer text gets its own pass.
          if (entry && entry.text === text) entry.translation = translation;
        });
      })
      .catch((err) => this.log('translate.error', (err as Error).message));
  }

  private upsertTranscript(itemId: string, speaker: Speaker, text: string, pending: boolean) {
    this.update((r) => {
      const existing = r.transcript.find((t) => t.id === itemId);
      if (existing) {
        if (text) existing.text = text;
        existing.pending = pending;
      } else {
        r.transcript.push({ id: itemId, speaker, text, at: Date.now(), pending });
      }
    });
  }

  private handleToolCall(callId: string, name: string, args: string) {
    const exec = executeTool(name, args, this.policy, this.canAskUser());
    this.log('ai.tool_call', `${name} ${args}`);
    this.log('policy.result', `${name} → ${JSON.stringify(exec.output)}`);
    this.update((r) => {
      r.metrics.toolCalls++;
      if (exec.decision) r.decisions.push(exec.decision);
      if (exec.replacesCommitmentId) r.commitments = r.commitments.filter((c) => c.id !== exec.replacesCommitmentId);
      if (exec.commitment) r.commitments.push(exec.commitment);
      if (exec.unresolvedQuestion && !r.unresolvedQuestions.includes(exec.unresolvedQuestion)) {
        r.unresolvedQuestions.push(exec.unresolvedQuestion);
      }
    });

    if (exec.askUser) this.askUser(exec.askUser);

    if (exec.endCall) {
      this.agent?.sendToolResult(callId, exec.output, false);
      this.update((r) => (r.endReason = exec.endCall!.outcome));
      this.log('ai.end_call', `${exec.endCall.outcome}: ${exec.endCall.reason}`);
      this.hangupRequested = true;
      this.awaitingResponseDone = true;
      // Fallback in case playback marks never arrive.
      this.timer(12_000, () => this.hangup());
      this.maybeHangup();
    } else {
      this.responding = true;
      this.agent?.sendToolResult(callId, exec.output, true);
    }
  }

  /** Hang up once the goodbye has finished playing to the other party. */
  private maybeHangup() {
    if (!this.hangupRequested || this.awaitingResponseDone || this.unplayed.size > 0) return;
    this.timer(400, () => this.hangup());
  }

  private hangup() {
    if (this.hungUp) return;
    this.hungUp = true;
    const sid = this.record.providerCallId;
    this.log('telephony.hangup');
    if (sid) {
      this.deps.telephony.hangup(sid).catch((err) => this.log('telephony.hangup_error', (err as Error).message));
    }
    // If the provider never confirms, finish anyway.
    this.timer(5_000, () => void this.finalize());
  }

  /** The user tapped End call in the app. */
  endByUser() {
    if (this.finalizing) return;
    this.log('call.user_ended');
    if (!this.record.providerCallId) {
      // Not dialed yet: nothing to hang up.
      this.update((r) => (r.endReason ??= 'user_ended'));
      void this.finalize('canceled');
      return;
    }
    this.endWith('user_ended');
  }

  private endWith(reason: string) {
    this.update((r) => (r.endReason ??= reason));
    this.hangup();
  }

  private fail(reason: string) {
    this.log('call.failed', reason);
    this.update((r) => (r.failureReason ??= reason));
    if (this.record.providerCallId) this.hangup();
    void this.finalize('failed');
  }

  // ───────────────────────────── wrap-up ─────────────────────────────

  /**
   * @param failure set when the call never connected (busy, no answer, provider/AI failure).
   */
  async finalize(failure?: CallResult['status']) {
    if (this.finalizing) return;
    this.finalizing = true;
    this.emitListen({ t: 'end' });
    this.listeners.clear();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    // Questions still waiting when the call ends become follow-ups for the user.
    this.update((r) => {
      for (const q of r.questions ?? []) {
        if (q.status !== 'pending') continue;
        q.status = 'expired';
        if (!r.unresolvedQuestions.includes(q.question)) r.unresolvedQuestions.push(q.question);
      }
    });
    this.update((r) => (r.metrics.endedAt = Date.now()));
    this.log('call.ended', this.record.endReason ?? failure);

    try {
      if (failure && !this.answered) {
        this.closeConnections();
        const reason = this.record.failureReason ?? FAILURE_TEXT[failure] ?? 'The call could not be completed.';
        this.update((r) => {
          r.failureReason = reason;
          r.result = emptyResult(failure, reason);
          r.status = 'failed';
        });
        return;
      }

      this.setStatus('analyzing');
      await this.waitForPendingTranscripts(3_000);
      this.closeConnections();

      let analysis: TranscriptAnalysis | null = null;
      let analysisError: string | null = null;
      if (this.deps.analyzer) {
        try {
          const r = this.record;
          analysis = await this.deps.analyzer.analyze({
            request: r.request,
            transcript: r.transcript,
            decisions: r.decisions,
            commitments: r.commitments,
            endReason: r.endReason,
          });
          this.log('analysis.done');
        } catch (err) {
          analysisError = (err as Error).message;
          this.log('analysis.error', analysisError);
        }
      }
      this.update((r) => {
        r.result = buildResult(r, analysis, analysisError);
        r.status = r.failureReason && r.transcript.length === 0 ? 'failed' : 'completed';
      });
    } finally {
      this.log('call.finished', this.record.status);
      await this.deps.store.persist(this.id).catch((err) => this.log('store.persist_error', (err as Error).message));
      this.deps.onFinished(this.id);
    }
  }

  private closeConnections() {
    this.agent?.close();
    this.transport?.close();
  }

  private async waitForPendingTranscripts(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && this.record.transcript.some((t) => t.pending)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    this.update((r) => {
      r.transcript = r.transcript.filter((t) => !(t.pending && !t.text));
      r.transcript.forEach((t) => (t.pending = false));
    });
  }
}

const FAILURE_TEXT: Partial<Record<CallResult['status'], string>> = {
  busy: 'The line was busy.',
  no_answer: 'Nobody answered the call.',
  canceled: 'The call was canceled before it connected.',
  failed: 'The call could not be connected.',
};

function emptyResult(status: CallResult['status'], reason: string): CallResult {
  return {
    status,
    success: false,
    objective: 'call_not_connected',
    appointment: null,
    commitments: [],
    additionalChargesAuthorized: false,
    unresolvedQuestions: [],
    refusedDecisions: [],
    followUpsForUser: ['Try the call again later.'],
    summary: reason,
    summaryInUserLanguage: reason,
    policyWarnings: [],
  };
}

const dedupe = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Merge the model's transcript analysis with the backend ledger. Backend facts win: an
 * appointment only counts if the policy engine validated it; anything else that was said is
 * surfaced as a warning for the user to verify.
 */
export function buildResult(r: CallRecord, analysis: TranscriptAnalysis | null, analysisError: string | null): CallResult {
  const appt = r.commitments.find((c) => c.type === 'appointment');
  const warnings: string[] = [];

  if (analysisError) warnings.push(`Automatic transcript analysis failed (${analysisError}); result is based on the policy ledger only.`);
  const unagreed = Boolean(appt && analysis?.counterpartAgreedToAppointment === false);
  if (unagreed) {
    warnings.push(
      `The AI confirmed ${appt!.date} at ${appt!.startTime}, but the other party may never have agreed to that time. Call to confirm before relying on it.`,
    );
  }
  if (analysis) {
    const m = analysis.appointmentMentioned;
    if (m?.date && (!appt || appt.date !== m.date || (m.time && appt.startTime !== m.time))) {
      warnings.push(
        `The conversation mentions an appointment on ${m.date}${m.time ? ` at ${m.time}` : ''} that the policy layer did not validate. Please confirm it directly with the business.`,
      );
    }
    if (r.commitments.length === 0 && analysis.verbalCommitments.length > 0) {
      warnings.push(`The assistant may have agreed to something without validation: ${analysis.verbalCommitments.join('; ')}`);
    }
    for (const f of analysis.possibleFabrications) warnings.push(`Possibly unsupported statement by the assistant: ${f}`);
  }

  const refused = [
    ...r.decisions
      .filter((d) => ['never_authorized', 'requires_user_approval'].includes(d.outcome) || (d.tool === 'confirm_agreement' && d.outcome === 'rejected'))
      .map((d) => ({ request: d.request, reason: d.reason, source: 'policy' as const })),
    ...(analysis?.refusedRequests ?? []).map((x) => ({ ...x, source: 'transcript' as const })),
  ];

  const additionalChargesAuthorized =
    r.commitments.some((c) => (c.costUsd ?? 0) > 0) ||
    r.decisions.some((d) => d.tool === 'request_decision' && d.category === 'additional_cost' && d.outcome === 'authorized');

  const status: CallResult['status'] = r.endReason === 'voicemail' ? 'voicemail' : 'completed';
  const fallbackSummary = appt
    ? `Appointment confirmed for ${appt.date} at ${appt.startTime} (${appt.description}).`
    : r.commitments[0]
      ? `Confirmed: ${r.commitments[0].description}.`
      : 'No commitment was confirmed during the call.';

  return {
    status,
    success: status !== 'voicemail' && !unagreed && (analysis ? analysis.objectiveAchieved : r.commitments.length > 0),
    objective: analysis?.objective ?? 'unknown',
    appointment: appt ? { date: appt.date!, time: appt.startTime!, notes: appt.description } : null,
    commitments: r.commitments,
    additionalChargesAuthorized,
    unresolvedQuestions: dedupe([...r.unresolvedQuestions, ...(analysis?.unresolvedQuestions ?? [])]),
    refusedDecisions: refused,
    followUpsForUser: analysis?.followUpsForUser ?? [],
    summary: analysis?.summary ?? fallbackSummary,
    summaryInUserLanguage: analysis?.summaryInUserLanguage ?? fallbackSummary,
    appointmentConfirmedByCounterpart: appt ? !unagreed : undefined,
    counterpartNotes: analysis?.notesAboutCounterpart,
    headlineInUserLanguage: analysis?.headlineInUserLanguage,
    nextStepsInUserLanguage: analysis?.nextStepsInUserLanguage,
    policyWarnings: warnings,
  };
}

export function newCallRecord(id: string, request: CallRecord['request']): CallRecord {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'preparing',
    request,
    transcript: [],
    decisions: [],
    commitments: [],
    unresolvedQuestions: [],
    metrics: { turnLatenciesMs: [], interruptions: 0, toolCalls: 0 },
    events: [],
  };
}

export const newCallId = () => randomUUID();
