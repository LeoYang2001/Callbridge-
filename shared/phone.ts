/** US phone helpers for the UI. The app only dials +1 numbers, so the field holds the 10-digit part. */

/** The national (10-digit) part of `input`, ignoring formatting and a leading +1 / 1. */
export function usNationalDigits(input: string): string {
  // US area codes never start with 1, so a leading 1 is always the country code.
  return input.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
}

/** Formats as you type: "9" → "(9", "9014" → "(901)-4", "9014553148" → "(901)-455-3148". */
export function formatUsPhone(input: string): string {
  const d = usNationalDigits(input);
  // No trailing punctuation, so backspace always removes a digit.
  if (d.length <= 3) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`;
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "+19014553148" → "+1 (901)-455-3148"; anything that isn't a full US number is shown as-is. */
export function displayPhone(e164: string): string {
  return /^\+1\d{10}$/.test(e164) ? `+1 ${formatUsPhone(e164)}` : e164;
}
