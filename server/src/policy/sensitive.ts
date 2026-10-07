import type { CallRequest } from '../../../shared/types';

/**
 * Level 4 data must never reach the voice model at all — the model cannot leak what it was
 * never given. This screen runs on everything the user submits before a call is placed.
 */

const SENSITIVE_LABEL =
  /\b(password|passcode|passwd|pin|ssn|social security|cvv|cvc|security code|card number|credit card|debit card|bank account|routing number|account number|iban|swift|one[- ]time code|otp|2fa|verification code|mother'?s maiden)\b/i;

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function containsCardNumber(text: string): boolean {
  const candidates = text.match(/\b(?:\d[ -]?){13,19}\b/g) ?? [];
  return candidates.some((c) => {
    const digits = c.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  });
}

/** Why a free-text answer can't be passed to the assistant, or null if it can. */
export function sensitiveTextReason(text: string): string | null {
  if (SSN.test(text)) return 'it looks like a Social Security number';
  if (containsCardNumber(text)) return 'it looks like a payment card number';
  if (SENSITIVE_LABEL.test(text)) return 'it mentions a password, code, or account number';
  return null;
}

export interface SensitiveFinding {
  field: string;
  reason: string;
}

export function findSensitiveData(req: CallRequest): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  const checkValue = (field: string, value: string) => {
    if (SSN.test(value)) findings.push({ field, reason: 'looks like a Social Security number' });
    else if (containsCardNumber(value)) findings.push({ field, reason: 'looks like a payment card number' });
  };

  req.authorizedInfo.forEach((fact, i) => {
    const field = `authorizedInfo[${i}] (${fact.label || 'unlabeled'})`;
    if (SENSITIVE_LABEL.test(fact.label)) {
      findings.push({ field, reason: `"${fact.label}" is a credential or financial identifier` });
    } else {
      checkValue(field, fact.value);
    }
  });
  checkValue('instructions', req.instructions);
  return findings;
}
