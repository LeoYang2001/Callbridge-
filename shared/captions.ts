/**
 * Captions a sentence at a time, in step with the voice. The model writes a line much faster than
 * it speaks it, so showing the text as it arrives runs ahead of the voice and lands all at once.
 * Instead, a sentence appears when the voice reaches it.
 */

// A sentence ends at CJK end punctuation, or at . ! ? ; followed by a space or the end (so "3.30"
// and "Dr.Smith" don't split), with any closing quotes or brackets.
const SENTENCE_END = /(?:[。！？；…]+|[.!?;]+(?=\s|$))["'”’）)」』]*\s*/g;

/** Where each sentence starts (character offsets); the first is always 0. */
export function sentenceStarts(text: string): number[] {
  const starts = [0];
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end < text.length) starts.push(end);
  }
  return starts;
}

/**
 * How many characters of `text` to show once the voice has spoken about `spoken` characters of
 * it: every sentence it has started, in full.
 */
export function captionAt(text: string, spoken: number): number {
  if (spoken >= text.length) return text.length;
  const starts = sentenceStarts(text);
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1]! <= spoken) k++;
  return k + 1 < starts.length ? starts[k + 1]! : text.length;
}

/** The part of `text` to show once `fraction` (0–1) of its audio has played. */
export function captionFor(text: string, fraction: number): string {
  return text.slice(0, captionAt(text, fraction * text.length)).trimEnd();
}

/** A first guess at speaking speed, in characters per second, before any line has been timed. */
export function defaultCharsPerSecond(text: string): number {
  const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []).length;
  return cjk > text.length / 3 ? 5 : 15;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  零: '0', 〇: '0', 一: '1', 幺: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
};
const WORD = '(?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine|\\d)';
const SEP = '[\\s,.\\-–]*';
const EN_RUN = new RegExp(`\\b${WORD}(?:${SEP}${WORD}){3,}\\b`, 'gi');
const ZH_RUN = /[零〇一幺二两三四五六七八九\d](?:[\s，,、\-]*[零〇一幺二两三四五六七八九\d]){3,}/g;

/** Groups digits the way they're written: (901) 455-3148 for ten, +1 and the rest for eleven. */
function groupDigits(d: string): string {
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

/**
 * Captions show numbers as digits. A read-back is spoken digit by digit, so the model's
 * transcript of it says "nine zero one, four five five…"; on screen that's (901) 455-3148.
 * Four or more digits in a row (English or Chinese digit words) are converted.
 */
export function digitsInCaption(text: string): string {
  const toDigits = (run: string) => {
    const tokens = run.match(/[a-z]+|[零〇一幺二两三四五六七八九]|\d/gi) ?? [];
    return groupDigits(tokens.map((t) => DIGIT_WORDS[t.toLowerCase()] ?? t).join(''));
  };
  return text.replace(EN_RUN, toDigits).replace(ZH_RUN, toDigits);
}

/** A caption on one line of flow: the model's line breaks become spaces, numbers become digits. */
export function captionText(text: string): string {
  return digitsInCaption(text.replace(/\s*\n+\s*/g, ' '));
}
