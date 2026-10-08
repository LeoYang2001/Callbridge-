import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { routeAudioForVoiceChat } from './audioSession';

/**
 * Live dictation while the talk button is held, with the phone's own speech recognizer. What
 * it hears is shown as you speak, and that exact text is what the assistant receives when you
 * let go, so what you see on screen is what the assistant got. Languages the phone can't
 * transcribe fall back to sending your voice (see useIntake).
 */

/** Recognizer locales to try for each app language, best first. */
const LOCALES: Record<string, string[]> = {
  'Chinese (Mandarin)': ['zh-CN', 'zh-TW'],
  'Chinese (Cantonese)': ['yue-CN', 'zh-HK'],
  Spanish: ['es-US', 'es-MX', 'es-ES'],
  Vietnamese: ['vi-VN'],
  Korean: ['ko-KR'],
  Tagalog: ['fil-PH'],
  Arabic: ['ar-SA', 'ar-AE'],
  Russian: ['ru-RU'],
  Portuguese: ['pt-BR', 'pt-PT'],
  French: ['fr-FR', 'fr-CA'],
  Hindi: ['hi-IN'],
  Bengali: ['bn-IN', 'bn-BD'],
  Urdu: ['ur-IN', 'ur-PK'],
  Persian: ['fa-IR'],
  Swahili: ['sw-KE'],
  Khmer: ['km-KH'],
  Lao: ['lo-LA'],
  Nepali: ['ne-NP'],
  Thai: ['th-TH'],
  Japanese: ['ja-JP'],
  Indonesian: ['id-ID'],
  Polish: ['pl-PL'],
  Ukrainian: ['uk-UA'],
  German: ['de-DE'],
  Italian: ['it-IT'],
  English: ['en-US'],
};

let supported: Set<string> | null = null;

/** The recognizer locale for an app language on this phone, or null to send voice instead. */
export async function dictationLocale(language: string): Promise<string | null> {
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return null;
    if (!supported) supported = new Set((await ExpoSpeechRecognitionModule.getSupportedLocales({})).locales);
    return LOCALES[language]?.find((l) => supported!.has(l)) ?? null;
  } catch {
    return null;
  }
}

const isCjk = (s: string) => /[぀-ヿ㐀-鿿가-힯]/.test(s);

export interface Dictation {
  /** Stops listening and resolves with everything heard (empty if nothing). */
  finish: () => Promise<string>;
  /** Drops it (a tap too short to be speech). */
  cancel: () => void;
}

/**
 * Starts listening. `onText` gets the running transcript as you speak. Names the recognizer
 * should expect (the phone book) help it spell them right.
 */
export async function startDictation(locale: string, names: string[], onText: (text: string) => void): Promise<Dictation> {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Allow the microphone and speech recognition for CallBridge in Settings.');

  let committed = '';
  let interim = '';
  const text = () => {
    const sep = isCjk(committed) ? '' : ' ';
    return `${committed}${committed && interim ? sep : ''}${interim}`.trim();
  };
  let ended: () => void = () => {};
  const done = new Promise<void>((r) => (ended = r));

  const subs = [
    ExpoSpeechRecognitionModule.addListener('result', (ev) => {
      const t = ev.results[0]?.transcript?.trim() ?? '';
      if (ev.isFinal) {
        // A finished segment (continuous mode starts a new one after a pause).
        if (t) committed = `${committed}${committed && !isCjk(t) ? ' ' : ''}${t}`;
        interim = '';
      } else {
        interim = t;
      }
      onText(text());
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => ended()),
    ExpoSpeechRecognitionModule.addListener('error', () => ended()),
  ];
  const cleanup = () => {
    subs.forEach((s) => s.remove());
    // The recognizer set up the audio session for recording; hand it back to the conversation.
    routeAudioForVoiceChat();
  };

  ExpoSpeechRecognitionModule.start({
    lang: locale,
    interimResults: true,
    continuous: true,
    addsPunctuation: true,
    contextualStrings: names.slice(0, 50),
    iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'default' },
  });

  return {
    finish: async () => {
      ExpoSpeechRecognitionModule.stop();
      // The last words arrive as a final result just before "end".
      await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
      cleanup();
      return text();
    },
    cancel: () => {
      ExpoSpeechRecognitionModule.abort();
      cleanup();
    },
  };
}
