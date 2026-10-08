import type { IntakeContext } from '../../shared/intake';
import {
  createIntakeConversation,
  exchangeSdp,
  type IntakeHandlers,
  type IntakeOptions,
  type IntakeSessionControls,
} from '../../shared/client/intake';
import { createIntakeSession } from './api';
import type { Settings } from './settings';

export type { IntakeLine, IntakeSessionControls, IntakeStatus } from '../../shared/client/intake';

/**
 * The intake conversation over WebRTC, straight from the browser to OpenAI Realtime. The server
 * mints a short-lived key with the instructions and tools fixed; the conversation logic (tools,
 * events, the draft) is shared with the mobile app, and this side owns the browser's peer
 * connection, mic and speaker.
 *
 * Speaking and typing share one session: typed text goes into the same conversation, and the
 * mic can be turned on and off without reconnecting (the audio sender just swaps tracks).
 */

/** The phone's location for "nearest …" searches; asked once, then reused for 10 minutes. */
let lastFix: { lat: number; lng: number; at: number } | null = null;
function currentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (lastFix && Date.now() - lastFix.at < 600_000) return Promise.resolve(lastFix);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
        resolve(lastFix);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    ),
  );
}

async function openMic(): Promise<MediaStreamTrack> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return stream.getAudioTracks()[0]!;
  } catch {
    throw new Error('Microphone access was blocked. Allow it for this site in your browser settings, or type below.');
  }
}

export async function startIntake(settings: Settings, ctx: IntakeContext, h: IntakeHandlers, opts: IntakeOptions): Promise<IntakeSessionControls> {
  h.onStatus('connecting');
  // Ask for the mic before minting the key, so a slow permission prompt can't outlast it.
  let micTrack: MediaStreamTrack | null = opts.mic ? await openMic() : null;
  const session = await createIntakeSession(settings, { ...ctx, followUpOf: opts.followUpOf, mode: opts.mode ?? 'call' });

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

  const conversation = createIntakeConversation({
    conn: settings,
    ctx,
    handlers: h,
    initialDraft: opts.initialDraft,
    send: (event) => dc.readyState === 'open' && (dc.send(JSON.stringify(event)), true),
    isOpen: () => dc.readyState === 'open',
    locate: currentLocation,
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    micTrack?.stop();
    dc.close();
    pc.close();
    speaker.srcObject = null;
    h.onStatus('ended');
  };

  dc.addEventListener('open', () => conversation.opened());
  dc.addEventListener('message', (msg) => conversation.handle(msg.data as string));
  pc.addEventListener('connectionstatechange', () => {
    if (!stopped && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
      h.onStatus('error', 'The voice connection dropped. Tap the mic to start again.');
      stop();
    }
  });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await pc.setRemoteDescription({ type: 'answer', sdp: await exchangeSdp(session.clientSecret, offer.sdp!) });
  } catch (err) {
    stop();
    throw err;
  }
  h.onStatus('listening');

  return {
    sendText: conversation.sendText,
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
