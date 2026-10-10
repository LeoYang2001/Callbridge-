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

describe('caption text', () => {
  it('shows read-back numbers as digits and joins line breaks', async () => {
    const { captionText } = await import('../../shared/captions');
    expect(captionText('The number is nine zero one, four five five, three one four eight. Right?')).toBe('The number is (901) 455-3148. Right?');
    expect(captionText('号码是九零一四五五三一四八，对吗？')).toBe('号码是(901) 455-3148，对吗？');
    expect(captionText('So the message is:\n\nsee you at one.')).toBe('So the message is: see you at one.');
    // Ordinary words and short numbers are left alone.
    expect(captionText('I have one or two questions at four.')).toBe('I have one or two questions at four.');
  });
});
