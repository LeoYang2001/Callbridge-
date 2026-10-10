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
  [/haitian|kreyòl|creole/i, 'ht'],
  [/french/i, 'fr'],
  [/german/i, 'de'],
  [/portuguese/i, 'pt'],
  [/italian/i, 'it'],
  [/bengali|bangla/i, 'bn'],
  [/urdu/i, 'ur'],
  [/persian|farsi/i, 'fa'],
  [/somali/i, 'so'],
  [/amharic/i, 'am'],
  [/swahili/i, 'sw'],
  [/khmer/i, 'km'],
  [/\blao\b/i, 'lo'],
  [/nepali/i, 'ne'],
  [/thai/i, 'th'],
  [/indonesian/i, 'id'],
  [/polish/i, 'pl'],
  [/ukrainian/i, 'uk'],
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

/**
 * The languages the mobile app offers at sign-up: the native name shown in the picker, and the
 * name saved in the profile (what the assistants are told to speak).
 */
export const APP_LANGUAGES: { native: string; name: string }[] = [
  { native: '中文（普通话）', name: 'Chinese (Mandarin)' },
  { native: '粵語', name: 'Chinese (Cantonese)' },
  { native: 'Español', name: 'Spanish' },
  { native: 'Tiếng Việt', name: 'Vietnamese' },
  { native: '한국어', name: 'Korean' },
  { native: 'Tagalog', name: 'Tagalog' },
  { native: 'العربية', name: 'Arabic' },
  { native: 'Русский', name: 'Russian' },
  { native: 'Kreyòl ayisyen', name: 'Haitian Creole' },
  { native: 'Português', name: 'Portuguese' },
  { native: 'Français', name: 'French' },
  { native: 'हिन्दी', name: 'Hindi' },
  { native: 'বাংলা', name: 'Bengali' },
  { native: 'اردو', name: 'Urdu' },
  { native: 'فارسی', name: 'Persian' },
  { native: 'Soomaali', name: 'Somali' },
  { native: 'አማርኛ', name: 'Amharic' },
  { native: 'Kiswahili', name: 'Swahili' },
  { native: 'Hmoob', name: 'Hmong' },
  { native: 'ខ្មែរ', name: 'Khmer' },
  { native: 'ພາສາລາວ', name: 'Lao' },
  { native: 'नेपाली', name: 'Nepali' },
  { native: 'ภาษาไทย', name: 'Thai' },
  { native: '日本語', name: 'Japanese' },
  { native: 'Bahasa Indonesia', name: 'Indonesian' },
  { native: 'Polski', name: 'Polish' },
  { native: 'Українська', name: 'Ukrainian' },
  { native: 'Deutsch', name: 'German' },
  { native: 'Italiano', name: 'Italian' },
  { native: 'English', name: 'English' },
];

/** The native name for a saved language ("Chinese (Mandarin)" → "中文（普通话）"). */
/** The app languages matching a search, by English name or in their own script. */
export function searchLanguages(query: string): typeof APP_LANGUAGES {
  const t = query.trim().toLowerCase();
  return t ? APP_LANGUAGES.filter((l) => l.native.toLowerCase().includes(t) || l.name.toLowerCase().includes(t)) : APP_LANGUAGES;
}

export const nativeLanguageName = (name: string) => APP_LANGUAGES.find((l) => l.name === name)?.native ?? name;

