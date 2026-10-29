import * as Device from 'expo-device';
import { NativeModules } from 'react-native';

/**
 * Calling from inside the app (Twilio Voice SDK): the app connects to Twilio, and the server
 * relays that leg to the person being called, the same as when it rings the user's phone. The
 * SDK is a native module, so it's loaded only when needed: an app built before it was added
 * says so instead of crashing.
 */

type VoiceCall = { disconnect: () => Promise<void>; mute: (on: boolean) => Promise<boolean>; on: (event: string, fn: (...args: any[]) => void) => void };

/**
 * This build includes the Twilio Voice SDK, on a real phone: calls go through CallKit, which the
 * iOS simulator doesn't have (the SDK loads there, but every call is cancelled at once).
 */
export const canJoinInApp = () => NativeModules.TwilioVoiceReactNative != null && Device.isDevice;

let voice: { connect: (token: string, opts: object) => Promise<VoiceCall> } | null = null;
let current: VoiceCall | null = null;

/** Connects the app's voice leg with a token and one-time code the server already issued (a translated call's start). */
export async function connectFromApp(join: { token: string; callId: string; code: string }, label: string, onEnded: (error?: string) => void): Promise<void> {
  if (!canJoinInApp()) throw new Error("Calling from the app needs a real iPhone with the latest CallBridge.");
  const { token, callId, code } = join;
  const sdk = require('@twilio/voice-react-native-sdk') as typeof import('@twilio/voice-react-native-sdk');
  voice ??= new sdk.Voice() as unknown as typeof voice;
  const call = await voice!.connect(token, { params: { callId, code }, contactHandle: label });
  current = call;
  const ended = (error?: string) => {
    if (error) console.warn('[appJoin] call ended with error:', error);
    if (current !== call) return;
    current = null;
    onEnded(error);
  };
  call.on(sdk.Call.Event.Disconnected, (err?: { message?: string; code?: number }) => ended(err ? `${err.message} (${err.code})` : undefined));
  call.on(sdk.Call.Event.ConnectFailure, (err?: { message?: string; code?: number }) => ended(err ? `${err.message} (${err.code})` : "Couldn't connect."));
}

/** Leaves the call (hands it back). */
export async function leaveAppJoin(): Promise<void> {
  const call = current;
  current = null;
  await call?.disconnect().catch(() => {});
}

export async function muteAppJoin(on: boolean): Promise<void> {
  await current?.mute(on);
}

export const inAppJoinActive = () => current !== null;
