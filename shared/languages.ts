/**
 * ISO-639-1 codes for the languages the app offers, used as a transcription hint. Without it,
 * short or noisy phone audio gets transcribed in the wrong language ("Esisteva explanar").
 */
const CODES: [RegExp, string][] = [
  [/mandarin|cantonese|chinese|中文/i, 'zh'],
  [/english/i, 'en'],
  [/spanish|español/i, 'es'],
  [/vietnamese/i, 'vi'],
  [/korean/i, 'ko'],
  [/tagalog|filipino/i, 'tl'],
  [/russian/i, 'ru'],
  [/arabic/i, 'ar'],
  [/hindi/i, 'hi'],
  [/japanese/i, 'ja'],
  [/french/i, 'fr'],
  [/german/i, 'de'],
  [/portuguese/i, 'pt'],
  [/italian/i, 'it'],
];

export function languageCode(language: string): string | undefined {
  return CODES.find(([re]) => re.test(language))?.[1];
}

/** The languages the app offers for talking to the assistant. */
export const LANGUAGES = ['Chinese (Mandarin)', 'Chinese (Cantonese)', 'Spanish', 'Vietnamese', 'Korean', 'Tagalog', 'Russian', 'Arabic', 'Hindi', 'Japanese', 'English'];

/** The app language for a device locale (BCP 47, e.g. "zh-Hans-US"), or English if it isn't offered. */
export function languageFromLocale(tag: string): string {
  const [lang = '', ...rest] = tag.toLowerCase().split('-');
  if (lang === 'zh' || lang === 'yue') return lang === 'yue' || rest.includes('hk') || rest.includes('mo') ? 'Chinese (Cantonese)' : 'Chinese (Mandarin)';
  if (lang === 'fil') return 'Tagalog';
  return LANGUAGES.find((l) => languageCode(l) === lang) ?? 'English';
}
