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
