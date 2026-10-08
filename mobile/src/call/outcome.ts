import type { CallRecord, CallSummary } from '@shared/types';
import { color, type TagName } from '@/theme/tokens';

/** How a call ended, as the design labels it (results, history, the capsule). */
export interface Outcome {
  label: string;
  tag: TagName;
  tint: string;
  good: boolean;
}

export function outcomeOf(call: CallRecord): Outcome {
  const r = call.result;
  if (call.status === 'failed' || !r || ['no_answer', 'busy', 'failed', 'canceled', 'voicemail'].includes(r.status)) {
    return { label: r?.status === 'voicemail' ? 'Voicemail' : r?.status === 'busy' ? 'Busy' : 'No answer', tag: 'No answer', tint: color.amberText, good: false };
  }
  if (!r.success) return { label: 'Not done', tag: 'Not booked', tint: color.redText, good: false };
  if (r.appointment) return { label: 'Booked', tag: 'Booked', tint: color.greenText, good: true };
  if (call.request.category === 'personal_call') return { label: 'Delivered', tag: 'Delivered', tint: color.blue, good: true };
  return { label: 'Answered', tag: 'Answered', tint: color.blue, good: true };
}

export function summaryTag(c: CallSummary): TagName {
  if (c.status === 'failed') return 'No answer';
  if (c.success === false) return 'Not booked';
  return 'Delivered';
}
