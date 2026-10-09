import { AudioManager } from 'react-native-audio-api';

/**
 * Talking to the assistant: record and play at once, through the loudspeaker rather than the
 * earpiece (a voice-chat session on iOS otherwise defaults to the earpiece), with Bluetooth
 * headsets allowed. Listening in on a call only plays.
 */
export function routeAudioForVoiceChat() {
  AudioManager.setAudioSessionOptions({
    iosCategory: 'playAndRecord',
    iosMode: 'voiceChat',
    iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
  });
}

/** Playback only, through the speaker (and past the silent switch); activates the session. */
export async function routeAudioForListening() {
  AudioManager.setAudioSessionOptions({ iosCategory: 'playback', iosMode: 'spokenAudio', iosOptions: [] });
  await AudioManager.setAudioSessionActivity(true).catch(() => {});
}
