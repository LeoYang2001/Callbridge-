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
