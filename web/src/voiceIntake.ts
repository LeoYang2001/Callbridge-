import { draftPatchFromArgs, type IntakeContext } from '../../shared/intake';
import type { IntakeCheckResult, IntakeDraft } from '../../shared/types';
import { checkIntake, createIntakeSession } from './api';
import type { Settings } from './settings';

/**
 * The intake conversation over WebRTC, straight from the browser to OpenAI Realtime. The server
 * mints a short-lived key with the instructions and tools fixed; this side plays audio, relays
 * tool calls, and keeps the draft. The draft is only a suggestion: the server checks it again
 * here (check_request) and once more when the call is placed.
 *
 * Speaking and typing share one session: typed text goes into the same conversation, and the
 * mic can be turned on and off without reconnecting (the audio sender just swaps tracks).
 */

export type IntakeStatus = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended' | 'error';

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
}

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

export interface IntakeSessionControls {
  /** Adds a typed message to the conversation; the assistant answers it like speech. */
  sendText: (text: string) => void;
  /** Turns the mic on (asking for permission the first time) or off, without reconnecting. */
  setMic: (on: boolean) => Promise<void>;
  /** Mutes or unmutes the assistant's voice; its words still appear on screen. */
  setSpeaker: (on: boolean) => void;
  stop: () => void;
}

async function openMic(): Promise<MediaStreamTrack> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return stream.getAudioTracks()[0]!;
  } catch {
    throw new Error('Microphone access was blocked. Allow it for this site in your browser settings, or type below.');
  }
}

export async function startIntake(
  settings: Settings,
  ctx: IntakeContext,
  h: IntakeHandlers,
  /** followUpOf: a finished call the assistant reports on first; initialDraft: its request. */
  opts: { mic: boolean; followUpOf?: string; initialDraft?: IntakeDraft },
): Promise<IntakeSessionControls> {
  h.onStatus('connecting');
  // Ask for the mic before minting the key, so a slow permission prompt can't outlast it.
  let micTrack: MediaStreamTrack | null = opts.mic ? await openMic() : null;
  const session = await createIntakeSession(settings, { ...ctx, followUpOf: opts.followUpOf });

  const pc = new RTCPeerConnection();
  const speaker = new Audio();
  speaker.autoplay = true;
  pc.ontrack = (e) => {
    speaker.srcObject = e.streams[0] ?? null;
  };
  // Always negotiate a send-capable audio slot, so the mic can join later without renegotiating.
  const audio = pc.addTransceiver('audio', { direction: 'sendrecv' });
  if (micTrack) await audio.sender.replaceTrack(micTrack);
  const dc = pc.createDataChannel('oai-events');

  let draft: IntakeDraft = { ...opts.initialDraft };
  let stopped = false;
  const partial = new Map<string, string>();
  /** Typed before the data channel opened; sent as soon as it does. */
  const pendingTexts: string[] = [];
  const send = (event: object) => dc.readyState === 'open' && dc.send(JSON.stringify(event));

  const pushText = (text: string) => {
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    // Interrupt the assistant if it's still talking, then answer the typed message.
    send({ type: 'response.cancel' });
    send({ type: 'output_audio_buffer.clear' });
    send({ type: 'response.create' });
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    micTrack?.stop();
    dc.close();
    pc.close();
    speaker.srcObject = null;
    h.onStatus('ended');
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
      const result = await checkIntake(settings, ctx, draft);
      h.onCheck(result);
      // The model gets the ruling, not just ok/not ok, so it can explain it in the user's language.
      return result;
    }
    if (name === 'finish_intake') {
      h.onReady();
      return { shown: true };
    }
    return { error: `Unknown tool ${name}` };
  };

  dc.addEventListener('open', () => {
    // Started by typing: answer that. Started by the mic: the assistant greets first.
    if (pendingTexts.length) pendingTexts.splice(0).forEach(pushText);
    else send({ type: 'response.create' });
  });
  dc.addEventListener('message', (msg) => {
    let ev: any;
    try {
      ev = JSON.parse(msg.data);
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
          (output) => {
            send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(output) } });
            send({ type: 'response.create' });
          },
          (err: Error) => {
            send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify({ error: err.message }) } });
            send({ type: 'response.create' });
          },
        );
        break;
      case 'error':
        // Expected when typing interrupts nothing, or races a response that already started.
        if (!['conversation_already_has_active_response', 'response_cancel_not_active'].includes(ev.error?.code)) {
          console.warn('Realtime error', ev.error);
        }
        break;
    }
  });
  pc.addEventListener('connectionstatechange', () => {
    if (!stopped && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
      h.onStatus('error', 'The voice connection dropped. Tap the mic to start again.');
      stop();
    }
  });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(REALTIME_CALLS_URL, {
      method: 'POST',
      body: offer.sdp,
      headers: { Authorization: `Bearer ${session.clientSecret}`, 'Content-Type': 'application/sdp' },
    });
    if (!res.ok) throw new Error(`OpenAI refused the voice session (HTTP ${res.status}).`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
  } catch (err) {
    stop();
    throw err;
  }
  h.onStatus('listening');

  let textCount = 0;
  return {
    sendText: (text) => {
      h.onLine({ id: `typed-${++textCount}`, role: 'user', text });
      if (dc.readyState === 'open') pushText(text);
      else pendingTexts.push(text);
    },
    setMic: async (on) => {
      if (on && !micTrack) {
        micTrack = await openMic();
        await audio.sender.replaceTrack(micTrack);
      } else if (!on && micTrack) {
        // Release the mic entirely (the browser's recording indicator goes off).
        micTrack.stop();
        micTrack = null;
        await audio.sender.replaceTrack(null);
      }
    },
    setSpeaker: (on) => {
      speaker.muted = !on;
    },
    stop,
  };
}
