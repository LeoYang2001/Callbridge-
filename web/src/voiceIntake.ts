import { draftPatchFromArgs, type IntakeContext } from '../../shared/intake';
import type { IntakeCheckResult, IntakeDraft } from '../../shared/types';
import { checkIntake, createIntakeSession } from './api';
import type { Settings } from './settings';

/**
 * Voice intake over WebRTC, straight from the browser to OpenAI Realtime. The server mints a
 * short-lived key with the instructions and tools fixed; this side plays audio, relays tool
 * calls, and keeps the draft. The draft is only a suggestion: the server checks it again here
 * (check_request) and once more when the call is placed.
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

export async function startIntake(settings: Settings, ctx: IntakeContext, h: IntakeHandlers): Promise<() => void> {
  h.onStatus('connecting');
  const session = await createIntakeSession(settings, ctx);

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error('Microphone access was blocked. Allow it for this site in your browser settings, or type instead.');
  }

  const pc = new RTCPeerConnection();
  const speaker = new Audio();
  speaker.autoplay = true;
  pc.ontrack = (e) => {
    speaker.srcObject = e.streams[0] ?? null;
  };
  pc.addTrack(mic.getAudioTracks()[0]!, mic);
  const dc = pc.createDataChannel('oai-events');

  let draft: IntakeDraft = {};
  let stopped = false;
  const partial = new Map<string, string>();
  const send = (event: object) => dc.readyState === 'open' && dc.send(JSON.stringify(event));

  const stop = () => {
    if (stopped) return;
    stopped = true;
    mic.getTracks().forEach((t) => t.stop());
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

  dc.addEventListener('open', () => send({ type: 'response.create' }));
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
        // Most realtime errors are recoverable (e.g. a response.create while one is active).
        if (ev.error?.code !== 'conversation_already_has_active_response') console.warn('Realtime error', ev.error);
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
  return stop;
}
