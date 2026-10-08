import { draftPatchFromArgs, type IntakeContext } from '../intake';
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

export type IntakeStatus = 'connecting' | 'listening' | 'thinking' | 'searching' | 'speaking' | 'ended' | 'error';

export interface IntakeLine {
  id: string;
  role: 'user' | 'assistant';
  text: string;
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
}

export interface IntakeSessionControls {
  /** Adds a typed message to the conversation; the assistant answers it like speech. */
  sendText: (text: string) => void;
  /** Turns the mic on (asking for permission the first time) or off, without reconnecting. */
  setMic: (on: boolean) => Promise<void>;
  /** Mutes or unmutes the assistant's voice; its words still appear on screen. */
  setSpeaker: (on: boolean) => void;
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
}) {
  const { conn, ctx, handlers: h, send } = deps;
  let draft: IntakeDraft = { ...deps.initialDraft };
  const partial = new Map<string, string>();
  /** Typed before the data channel opened; sent as soon as it does. */
  const pendingTexts: string[] = [];
  let textCount = 0;

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
    if (name === 'finish_intake' || name === 'finish_profile') {
      h.onReady();
      return { shown: true };
    }
    return { error: `Unknown tool ${name}` };
  };

  const reply = (callId: string, output: unknown) => {
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
    send({ type: 'response.create' });
  };

  return {
    /** The data channel opened. Started by typing: answer that. Started by the mic: the assistant greets first. */
    opened() {
      if (pendingTexts.length) pendingTexts.splice(0).forEach(pushText);
      else send({ type: 'response.create' });
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
        case 'input_audio_buffer.speech_started':
          h.onStatus('listening');
          break;
        case 'input_audio_buffer.speech_stopped':
          h.onStatus('thinking');
          break;
        case 'output_audio_buffer.started':
          h.onStatus('speaking');
          break;
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          h.onStatus('listening');
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (ev.transcript?.trim()) h.onLine({ id: ev.item_id, role: 'user', text: ev.transcript.trim() });
          break;
        case 'response.output_audio_transcript.delta': {
          const text = (partial.get(ev.item_id) ?? '') + (ev.delta ?? '');
          partial.set(ev.item_id, text);
          h.onLine({ id: ev.item_id, role: 'assistant', text });
          break;
        }
        case 'response.output_audio_transcript.done':
          partial.delete(ev.item_id);
          if (ev.transcript) h.onLine({ id: ev.item_id, role: 'assistant', text: ev.transcript });
          break;
        case 'response.function_call_arguments.done':
          void runTool(ev.name, ev.arguments).then(
            (output) => reply(ev.call_id, output),
            (err: Error) => reply(ev.call_id, { error: err.message }),
          );
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
