/**
 * Telephony is split in two so providers can be swapped independently:
 *  - TelephonyProvider: control plane (place a call, hang up, map provider status events).
 *  - MediaTransport: the live, bidirectional audio stream for one call.
 * Audio crosses this boundary as base64 G.711 μ-law @ 8 kHz, the native format of the PSTN,
 * which the voice provider also accepts directly — so no transcoding happens on our server.
 */

export interface PlaceCallParams {
  callId: string;
  to: string;
  /** Caller ID to show (a verified number of the user's); default the provider's own number. */
  from?: string;
  /** Opaque secret the media stream must present to attach to this call. */
  streamToken: string;
  maxDurationSeconds: number;
}

/** Ringing the user into their own call (take-over): their phone joins as a second media stream. */
export interface PlaceUserLegParams {
  callId: string;
  /** The user's phone. */
  to: string;
  /** Opaque secret the user's media stream must present. */
  streamToken: string;
  maxDurationSeconds: number;
}

export interface TelephonyProvider {
  readonly name: string;
  placeCall(params: PlaceCallParams): Promise<{ providerCallId: string }>;
  placeUserLeg?(params: PlaceUserLegParams): Promise<{ providerCallId: string }>;
  /** Verified caller IDs: start verifying a number (the provider calls it with a code), and check one. */
  startCallerIdVerification?(phone: string, label: string): Promise<{ validationCode: string }>;
  isVerifiedCallerId?(phone: string): Promise<boolean>;
  hangup(providerCallId: string): Promise<void>;
  /** Current call state, polled as a fallback when status callbacks are delayed or disabled. */
  getCallState?(providerCallId: string): Promise<TelephonyCallState | null>;
}

/** Normalized provider call states. */
export type TelephonyCallState =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'completed'
  | 'busy'
  | 'no_answer'
  | 'failed'
  | 'canceled';

export interface MediaTransportEvents {
  /** Base64 μ-law audio from the remote party. `timestampMs` is ms since stream start. */
  audio: (payloadB64: string, timestampMs: number) => void;
  /** A previously sent playback mark has been reached (audio before it was played). */
  mark: (name: string) => void;
  /** Stream ended (remote hangup or provider closed). */
  stop: () => void;
}

export interface MediaTransport {
  sendAudio(payloadB64: string): void;
  /** Drop any queued, not-yet-played outbound audio (barge-in). */
  clearAudio(): void;
  sendMark(name: string): void;
  on<E extends keyof MediaTransportEvents>(event: E, listener: MediaTransportEvents[E]): void;
  close(): void;
}
