import { describe, expect, it } from 'vitest';
import { captionAt, captionFor, sentenceStarts } from '../../shared/captions';

describe('captions', () => {
  it('splits sentences in English and Chinese, not at decimals or times', () => {
    expect(sentenceStarts('Hi Leo. The nearest one closes at 9.30 tonight! Want it?')).toEqual([0, 8, 48]);
    expect(sentenceStarts('好的。我来查一下附近的药店，请稍等。')).toEqual([0, 3]);
    expect(sentenceStarts('“好的。”然后呢')).toEqual([0, 5]);
  });

  it('shows each sentence once the voice reaches it, in full', () => {
    const text = 'One moment. Let me look that up. Found three.';
    expect(captionFor(text, 0)).toBe('One moment.');
    expect(captionFor(text, 0.3)).toBe('One moment. Let me look that up.');
    expect(captionFor(text, 0.75)).toBe(text);
    expect(captionFor(text, 1)).toBe(text);
    expect(captionAt(text, 999)).toBe(text.length);
  });
});
