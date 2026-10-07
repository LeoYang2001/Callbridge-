import { describe, expect, it } from 'vitest';
import { displayPhone, formatUsPhone, usNationalDigits } from '../../shared/phone';
import { normalizePhone } from '../src/util/phone';

describe('US phone field', () => {
  it('formats progressively without trailing punctuation', () => {
    expect(['', '9', '90', '901', '9014', '901455', '9014553', '9014553148'].map(formatUsPhone)).toEqual([
      '',
      '(9',
      '(90',
      '(901',
      '(901)-4',
      '(901)-455',
      '(901)-455-3',
      '(901)-455-3148',
    ]);
  });

  it('drops a pasted or autofilled country code and extra digits', () => {
    expect(usNationalDigits('+1 (901) 455-3148')).toBe('9014553148');
    expect(usNationalDigits('19014553148')).toBe('9014553148');
    expect(usNationalDigits('901455314899')).toBe('9014553148');
  });

  it('round-trips through the stored E.164 value the server accepts', () => {
    const stored = `+1${usNationalDigits('(901)-455-3148')}`;
    expect(normalizePhone(stored)).toBe('+19014553148');
    expect(formatUsPhone(stored)).toBe('(901)-455-3148');
    expect(displayPhone(stored)).toBe('+1 (901)-455-3148');
    expect(displayPhone('+1 555 010 0000')).toBe('+1 555 010 0000');
  });
});
