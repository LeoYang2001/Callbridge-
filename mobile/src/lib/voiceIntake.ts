import { mediaDevices, RTCPeerConnection, type MediaStreamTrack } from 'react-native-webrtc';
import type { IntakeContext } from '@shared/intake';
import {
  createIntakeConversation,
  exchangeSdp,
  type IntakeHandlers,
  type IntakeOptions,
  type IntakeSessionControls,
} from '@shared/client/intake';
import { createIntakeSession, type Connection } from './api';
import { routeAudioForVoiceChat } from './audioSession';
import { currentLocation } from './location';

export type { IntakeLine, IntakeSessionControls, IntakeStatus } from '@shared/client/intake';

/**
 * The intake conversation over WebRTC (react-native-webrtc), straight from the phone to OpenAI
 * Realtime. The server mints a short-lived key with the instructions and tools fixed; the
 * conversation logic (tools, events, the draft) is shared with the web app, and this side owns
 * the peer connection, the mic and the speaker.
 *
 * Speaking and typing share one session: typed text goes into the same conversation, and the
 * mic can be turned on and off without reconnecting (the audio sender just swaps tracks).
 */

/**
 * addEventListener, typed. react-native-webrtc's published types import a vendored
 * event-target-shim that isn't in the package, so its classes lose their EventTarget methods
 * in TypeScript (they work at runtime).
 */
function on<E>(target: unknown, type: string, fn: (e: E) => void) {
  (target as { addEventListener: (type: string, fn: (e: E) => void) => void }).addEventListener(type, fn);
}

async function openMic(): Promise<MediaStreamTrack> {
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    return stream.getAudioTracks()[0]!;
  } catch {
    throw new Error('Microphone access is off for CallBridge. Turn it on in Settings, or type instead.');
  }
}

export async function startIntake(conn: Connection, ctx: IntakeContext, h: IntakeHandlers, opts: IntakeOptions): Promise<IntakeSessionControls> {
  h.onStatus('connecting');
  const ptt = Boolean(opts.pushToTalk);
  // Ask for the mic before minting the key, so a slow permission prompt can't outlast it.
  // Push-to-talk keeps the track muted except while the talk button is held.
  let micTrack: MediaStreamTrack | null = opts.mic ? await openMic() : null;
  if (micTrack && ptt) micTrack.enabled = false;
  const session = await createIntakeSession(conn, { ...ctx, followUpOf: opts.followUpOf, mode: opts.mode ?? 'call', pushToTalk: ptt });
  routeAudioForVoiceChat();

  const pc = new RTCPeerConnection({});
  // The assistant's voice plays as soon as its track arrives; muting it disables the track.
  let remoteTrack: MediaStreamTrack | null = null;
  let speakerOn = true;
  on<{ track?: MediaStreamTrack }>(pc, 'track', (e) => {
    remoteTrack = e.track ?? null;
    if (remoteTrack) remoteTrack.enabled = speakerOn;
  });
  // Always negotiate a send-capable audio slot, so the mic can join later without renegotiating.
  const audio = pc.addTransceiver('audio', { direction: 'sendrecv' });
  if (micTrack) await audio.sender.replaceTrack(micTrack);
  const dc = pc.createDataChannel('oai-events');

  const conversation = createIntakeConversation({
    conn,
    ctx,
    handlers: h,
    initialDraft: opts.initialDraft,
    firstText: opts.firstText,
    waitForUser: opts.waitForUser,
    send: (event) => dc.readyState === 'open' && (dc.send(JSON.stringify(event)), true),
    isOpen: () => dc.readyState === 'open',
    locate: currentLocation,
    pushToTalk: ptt,
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    micTrack?.stop();
    dc.close();
    pc.close();
    h.onStatus('ended');
  };

  on(dc, 'open', () => conversation.opened());
  on<{ data: unknown }>(dc, 'message', (msg) => conversation.handle(String(msg.data)));
  on(pc, 'connectionstatechange', () => {
    if (!stopped && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
      h.onStatus('error', 'The voice connection dropped. Tap the mic to start again.');
      stop();
    }
  });

  try {
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    await pc.setRemoteDescription({ type: 'answer', sdp: await exchangeSdp(session.clientSecret, offer.sdp) });
  } catch (err) {
    stop();
    throw err;
  }
  h.onStatus(ptt ? 'yourTurn' : 'listening');

  /** Push-to-talk: the end of a word is still in flight when the finger lifts. */
  const TAIL_MS = 250;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    sendText: conversation.sendText,
    setMic: async (on) => {
      if (on && !micTrack) {
        micTrack = await openMic();
        await audio.sender.replaceTrack(micTrack);
      } else if (!on && micTrack) {
        // Release the mic entirely (the orange recording dot goes off).
        micTrack.stop();
        micTrack = null;
        await audio.sender.replaceTrack(null);
      }
    },
    setSpeaker: (on) => {
      speakerOn = on;
      if (remoteTrack) remoteTrack.enabled = on;
    },
    startTurn: async () => {
      clearTimeout(releaseTimer);
      if (!micTrack) {
        micTrack = await openMic();
        await audio.sender.replaceTrack(micTrack);
      }
      micTrack.enabled = true;
      conversation.startTurn();
    },
    endTurn: () => {
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        if (micTrack) micTrack.enabled = false;
        conversation.endTurn();
      }, TAIL_MS);
    },
    cancelTurn: () => {
      clearTimeout(releaseTimer);
      if (micTrack) micTrack.enabled = false;
      conversation.cancelTurn();
    },
    interrupt: () => conversation.interrupt(),
    stop,
  };
}
