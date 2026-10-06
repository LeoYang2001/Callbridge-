const E164 = /^\+[1-9]\d{7,14}$/;

/** Normalizes common formatting ("+1 (415) 555-0123") to E.164. Returns null if impossible. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  const candidate = trimmed.startsWith('+') ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return E164.test(candidate) ? candidate : null;
}

/**
 * Numbers the assistant must never dial. Emergency short codes (911, 112, …) can't pass E.164
 * validation at all; this additionally blocks North American N11 and premium-rate area codes.
 */
export function blockedReason(e164: string): string | null {
  if (e164.startsWith('+1') && e164.length === 12) {
    const areaCode = e164.slice(2, 5);
    if (/^[2-9]11$/.test(areaCode)) return 'N11 service codes cannot be dialed';
    if (areaCode === '900' || areaCode === '976') return 'premium-rate numbers cannot be dialed';
  }
  return null;
}
