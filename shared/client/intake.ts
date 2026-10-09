import { draftPatchFromArgs, type IntakeContext } from '../intake';
import { captionAt, defaultCharsPerSecond } from '../captions';
import { profilePatchFromArgs } from '../profilePatch';
import type { IntakeCheckResult, IntakeDraft, Me, ResearchResult } from '../types';
import { checkIntake, research, updateProfile, type Connection } from './api';

/**
 * The intake conversation's logic, shared by the web and mobile apps: it reads OpenAI Realtime
 * events, runs the tools, and keeps the draft. The platform owns the transport (a WebRTC peer
 * connection, the mic and the speaker) and feeds events in; see web/src/voiceIntake.ts and
 * mobile/src/lib/voiceIntake.ts.
 *
 * The draft is only a suggestion: the server checks it again (check_request) and once more when
 * the call is placed.
 */

/**
 * "listening": the user is speaking (open mic) or holding the talk button (push-to-talk);
 * "yourTurn": push-to-talk only, waiting for the user to hold the button or tap a chip.
 */
export type IntakeStatus = 'connecting' | 'listening' | 'yourTurn' | 'thinking' | 'searching' | 'speaking' | 'ended' | 'error';

export interface IntakeLine {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Still being transcribed or spoken. */
  partial?: boolean;
}

/** The question the assistant just asked, with answers to tap (push-to-talk). */
export interface IntakeChoices {
  question: string;
  questionEn?: string;
  choices: string[];
  topic?: string;
}

export interface IntakeHandlers {
  onStatus: (status: IntakeStatus, detail?: string) => void;
  onLine: (line: IntakeLine) => void;
  onDraft: (draft: IntakeDraft) => void;
  onCheck: (result: IntakeCheckResult) => void;
  /** The assistant finished gathering and the server said the request is ok. */
  onReady: () => void;
  /** Profile interview: the saved profile after each update. */
  onProfile?: (me: Me) => void;
  /** What the research agent found: an answer, places to show as cards, and sources. */
  onResearch?: (result: ResearchResult) => void;
  /** Push-to-talk: the question just asked and its answer chips. */
  onChoices?: (choices: IntakeChoices) => void;
}

export interface IntakeOptions {
  /** Start with the mic on (the assistant greets first) or off (typing). */
  mic: boolean;
  /** "profile": the profile interview instead of setting up a call. */
  mode?: 'call' | 'profile';
  /** A finished call the assistant reports on first. */
  followUpOf?: string;
  /** Seeds the draft, e.g. with the previous call's request. */
  initialDraft?: IntakeDraft;
  /** Push-to-talk turns and answer chips (the mobile app). */
  pushToTalk?: boolean;
  /**
   * The user's first message (a tapped suggestion, typed text). Sent as the opening turn instead
   * of the greeting; sending it after connecting races the greeting.
   */
  firstText?: string;
  /** Don't greet: the user is already holding the talk button, so their turn comes first. */
  waitForUser?: boolean;
}

export interface IntakeSessionControls {
  /** Adds a typed message to the conversation; the assistant answers it like speech. */
  sendText: (text: string) => void;
  /** Turns the mic on (asking for permission the first time) or off, without reconnecting. */
  setMic: (on: boolean) => Promise<void>;
  /** Mutes or unmutes the assistant's voice; its words still appear on screen. */
  setSpeaker: (on: boolean) => void;
  /** Push-to-talk: the user pressed the talk button (interrupts the assistant). */
  startTurn?: () => Promise<void>;
  /** Push-to-talk: released; sends what they said. */
  endTurn?: () => void;
  /** Push-to-talk: a tap too short to be speech; drops it. */
  cancelTurn?: () => void;
  /** Stops the assistant mid-sentence (the user started talking; their words will follow as text). */
  interrupt?: () => void;
  stop: () => void;
}

export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

/** Sends the WebRTC offer to OpenAI with the short-lived key the server minted; returns the answer SDP. */
export async function exchangeSdp(clientSecret: string, offerSdp: string): Promise<string> {
  const res = await fetch(REALTIME_CALLS_URL, {
    method: 'POST',
    body: offerSdp,
    headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
  });
  if (!res.ok) throw new Error(`OpenAI refused the voice session (HTTP ${res.status}).`);
  return res.text();
}

export type Locate = () => Promise<{ lat: number; lng: number } | null>;

/**
 * The conversation itself. `send` writes a client event to the data channel (dropping it if the
 * channel isn't open); the platform calls `opened()` when the channel opens and `handle()` with
 * every server event.
 */
export function createIntakeConversation(deps: {
  conn: Connection;
  ctx: IntakeContext;
  handlers: IntakeHandlers;
  initialDraft?: IntakeDraft;
  send: (event: object) => boolean;
  isOpen: () => boolean;
  /** The phone's location for "nearest …" searches, or null if unknown or not allowed. */
  locate: Locate;
  pushToTalk?: boolean;
  /** Opens the conversation instead of the greeting (see IntakeOptions.firstText). */
  firstText?: string;
  waitForUser?: boolean;
}) {
  const { conn, ctx, handlers, send } = deps;
  /**
   * Lookups in flight. The assistant says "let me check" in the same turn that starts one; that
   * sentence (starting or finishing) must not interrupt the "looking it up" screen while the
   * search still runs.
   */
  let searching = 0;
  const h: IntakeHandlers = {
    ...handlers,
    onStatus: (status, detail) =>
      handlers.onStatus(searching > 0 && (status === 'listening' || status === 'yourTurn' || status === 'thinking' || status === 'speaking') ? 'searching' : status, detail),
  };
  let draft: IntakeDraft = { ...deps.initialDraft };
  const heard = new Map<string, string>();
  /** Typed before the data channel opened; sent as soon as it does. */
  const pendingTexts: string[] = [];
  /** Tool calls in flight, by call id: answered once the whole assistant turn is done. */
  const toolRuns = new Map<string, Promise<void>>();
  let textCount = 0;
  if (deps.firstText?.trim()) {
    const text = deps.firstText.trim();
    pendingTexts.push(text);
    h.onLine({ id: `typed-${++textCount}`, role: 'user', text });
  }

  /**
   * The assistant line being spoken, shown a sentence at a time as the voice reaches it (its text
   * arrives far faster than it's spoken). Timed from when the voice starts, at a speaking speed
   * measured from earlier lines.
   */
  let speaking: { id: string; text: string; done: boolean; shown: number } | null = null;
  let voiceStartedAt: number | null = null;
  let voicedChars = 0;
  let charsPerSecond: number | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let noVoice: ReturnType<typeof setTimeout> | undefined;

  /** final: all of it (the voice finished, or never played); 'cut': only what was said (interrupted). */
  const showSpeaking = (end?: 'final' | 'cut') => {
    const line = speaking;
    if (!line) return;
    if (!end) {
      if (voiceStartedAt === null) return;
      const rate = charsPerSecond ?? defaultCharsPerSecond(line.text);
      const n = captionAt(line.text, ((Date.now() - voiceStartedAt) / 1000) * rate);
      // Whole and spoken through: final now.
      if (line.done && n >= line.text.length) return showSpeaking('final');
      if (n === line.shown) return;
      line.shown = n;
      h.onLine({ id: line.id, role: 'assistant', text: line.text.slice(0, n).trimEnd(), partial: true });
      return;
    }
    speaking = null;
    clearInterval(ticker);
    ticker = undefined;
    clearTimeout(noVoice);
    const text = end === 'final' ? line.text : line.text.slice(0, line.shown).trimEnd();
    if (text) h.onLine({ id: line.id, role: 'assistant', text });
  };
  const tick = () => {
    if (!ticker) ticker = setInterval(() => (deps.isOpen() ? showSpeaking() : showSpeaking('cut')), 150);
    showSpeaking();
  };
  /** The voice for this turn stopped: learn the speaking speed from it. */
  const voiceEnded = (finished: boolean) => {
    if (finished && voiceStartedAt !== null && voicedChars > 0) {
      const seconds = (Date.now() - voiceStartedAt) / 1000;
      if (seconds > 1.2) {
        const measured = voicedChars / seconds;
        charsPerSecond = charsPerSecond === null ? measured : (charsPerSecond + measured) / 2;
      }
    }
    voiceStartedAt = null;
    voicedChars = 0;
  };

  const idle = (): IntakeStatus => (deps.pushToTalk ? 'yourTurn' : 'listening');

  const pushText = (text: string) => {
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    // Interrupt the assistant if it's still talking, then answer the typed message.
    send({ type: 'response.cancel' });
    send({ type: 'output_audio_buffer.clear' });
    send({ type: 'response.create' });
  };

  const runTool = async (name: string, rawArgs: string): Promise<unknown> => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(rawArgs || '{}');
    } catch {
      return { error: 'Arguments were not valid JSON.' };
    }
    if (name === 'update_request') {
      draft = { ...draft, ...draftPatchFromArgs(args) };
      h.onDraft(draft);
      return { saved: true };
    }
    if (name === 'check_request') {
      const result = await checkIntake(conn, ctx, draft);
      h.onCheck(result);
      // The model gets the ruling, not just ok/not ok, so it can explain it in the user's language.
      return result;
    }
    if (name === 'research') {
      const question = String(args.question ?? '').trim();
      const depth = args.depth === 'thorough' ? 'thorough' : 'quick';
      const near = typeof args.near === 'string' && args.near.trim() ? args.near.trim() : undefined;
      // Location only helps "near me" questions; asked once, with the user's permission.
      const here = near ? null : await deps.locate();
      searching++;
      h.onStatus('searching');
      try {
        const result = await research(conn, { question, depth, near, userLanguage: ctx.userLanguage, ...(here ? { lat: here.lat, lng: here.lng } : {}) });
        h.onResearch?.(result);
        // Compact for the model: enough to answer and pick, with what's unverified marked.
        return {
          answer: result.answer,
          places: result.places.map((r) => ({
            name: r.name,
            phone: r.phone,
            address: r.address,
            distance_miles: r.distanceMeters != null ? Math.round(r.distanceMeters / 160.9) / 10 : null,
            why: r.why ?? null,
            verified: r.verified,
            in_phone_book_as: r.inPhoneBookAs ?? null,
          })),
          location_used: near ?? (here ? 'the user’s current location' : 'unknown (ask for a city or zip if it matters)'),
        };
      } catch (e) {
        return { error: (e as Error).message };
      } finally {
        searching--;
        h.onStatus('thinking');
      }
    }
    if (name === 'update_profile') {
      // The server validates and screens it (no card numbers, SSNs, or passwords are stored).
      try {
        const me = await updateProfile(conn, profilePatchFromArgs(args));
        h.onProfile?.(me);
        return { saved: true };
      } catch (e) {
        return { saved: false, error: (e as Error).message };
      }
    }
    if (name === 'show_choices') {
      const choices = Array.isArray(args.choices) ? args.choices.map(String).filter(Boolean).slice(0, 4) : [];
      h.onChoices?.({
        question: String(args.question ?? ''),
        questionEn: typeof args.question_en === 'string' ? args.question_en : undefined,
        choices,
        topic: typeof args.topic === 'string' ? args.topic : undefined,
      });
      return { shown: true };
    }
    if (name === 'finish_intake' || name === 'finish_profile') {
      h.onReady();
      return { shown: true };
    }
    return { error: `Unknown tool ${name}` };
  };

  const output = (callId: string, value: unknown) =>
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(value) } });

  /**
   * An assistant turn ended. If it called tools, the assistant answers their results in one
   * new turn. Showing answer chips alongside a spoken question needs no answer; chips alone
   * (nothing said yet) do.
   */
  const turnDone = async (items: { type?: string; name?: string; call_id?: string }[]) => {
    const calls = items.filter((i) => i.type === 'function_call');
    if (!calls.length) return;
    const spoke = items.some((i) => i.type === 'message');
    const others = calls.filter((c) => c.name !== 'show_choices');
    await Promise.all(calls.map((c) => toolRuns.get(c.call_id ?? '') ?? Promise.resolve()));
    calls.forEach((c) => toolRuns.delete(c.call_id ?? ''));
    if (others.length || !spoke) send({ type: 'response.create' });
  };

  return {
    /** The data channel opened. Started by typing: answer that. Started by the mic: the assistant greets first, unless the user is already talking. */
    opened() {
      if (pendingTexts.length) pendingTexts.splice(0).forEach(pushText);
      else if (!deps.waitForUser) send({ type: 'response.create' });
    },

    /** Push-to-talk: the button went down. Stops the assistant and starts a fresh turn. */
    startTurn() {
      send({ type: 'response.cancel' });
      send({ type: 'output_audio_buffer.clear' });
      send({ type: 'input_audio_buffer.clear' });
      h.onStatus('listening');
    },

    /** Push-to-talk: the button came up. Sends the turn and asks for the answer. */
    endTurn() {
      send({ type: 'input_audio_buffer.commit' });
      send({ type: 'response.create' });
      h.onStatus('thinking');
    },

    /** Stops the assistant mid-sentence; the user's turn follows as text (dictation). */
    interrupt() {
      send({ type: 'response.cancel' });
      send({ type: 'output_audio_buffer.clear' });
      h.onStatus('listening');
    },

    /** Push-to-talk: a tap too short to be speech. Drops it and waits again. */
    cancelTurn() {
      send({ type: 'input_audio_buffer.clear' });
      h.onStatus(idle());
    },

    sendText(text: string) {
      h.onLine({ id: `typed-${++textCount}`, role: 'user', text });
      if (deps.isOpen()) pushText(text);
      else pendingTexts.push(text);
    },

    handle(raw: string) {
      let ev: any;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      switch (ev.type) {
        case 'conversation.item.input_audio_transcription.delta': {
          const text = (heard.get(ev.item_id) ?? '') + (ev.delta ?? '');
          heard.set(ev.item_id, text);
          if (text.trim()) h.onLine({ id: ev.item_id, role: 'user', text: text.trim(), partial: true });
          break;
        }
        case 'input_audio_buffer.speech_started':
          h.onStatus('listening');
          break;
        case 'input_audio_buffer.speech_stopped':
          h.onStatus('thinking');
          break;
        case 'output_audio_buffer.started':
          voiceStartedAt = Date.now();
          voicedChars = 0;
          if (speaking) tick();
          h.onStatus('speaking');
          break;
        case 'output_audio_buffer.stopped':
          showSpeaking('final');
          voiceEnded(true);
          h.onStatus(idle());
          break;
        case 'output_audio_buffer.cleared':
          showSpeaking('cut');
          voiceEnded(false);
          h.onStatus(idle());
          break;
        case 'conversation.item.input_audio_transcription.completed':
          heard.delete(ev.item_id);
          if (ev.transcript?.trim()) h.onLine({ id: ev.item_id, role: 'user', text: ev.transcript.trim() });
          break;
        case 'response.output_audio_transcript.delta': {
          if (speaking && speaking.id !== ev.item_id) showSpeaking('final');
          speaking ??= { id: ev.item_id, text: '', done: false, shown: 0 };
          speaking.text += ev.delta ?? '';
          tick();
          break;
        }
        case 'response.output_audio_transcript.done': {
          if (speaking && speaking.id !== ev.item_id) showSpeaking('final');
          speaking ??= { id: ev.item_id, text: '', done: false, shown: 0 };
          speaking.text = ev.transcript ?? speaking.text;
          speaking.done = true;
          voicedChars += speaking.text.length;
          // No voice at all (it failed, or this turn was text only): show it anyway.
          const line = speaking;
          clearTimeout(noVoice);
          noVoice = setTimeout(() => {
            if (speaking === line && voiceStartedAt === null) showSpeaking('final');
          }, 1500);
          tick();
          break;
        }
        case 'response.function_call_arguments.done':
          toolRuns.set(
            ev.call_id,
            runTool(ev.name, ev.arguments).then(
              (value) => void output(ev.call_id, value),
              (err: Error) => void output(ev.call_id, { error: err.message }),
            ),
          );
          break;
        case 'response.done':
          void turnDone(ev.response?.output ?? []);
          break;
        case 'error':
          // Expected when typing interrupts nothing, or races a response that already started.
          if (!['conversation_already_has_active_response', 'response_cancel_not_active'].includes(ev.error?.code)) {
            console.warn('Realtime error', ev.error);
          }
          break;
      }
    },
  };
}
