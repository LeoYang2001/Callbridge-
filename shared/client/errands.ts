import type { Errand } from '../types';

/**
 * How to describe an errand in a list, shared by the web and mobile apps (English UI text; the
 * outcome line is already in the user's language when it comes from a call).
 */

const WAITING_TEXT: Record<NonNullable<Errand['waitingFor']>, string> = {
  turn: 'Up next',
  scheduled: 'Scheduled',
  calling_hours: 'Waiting for calling hours',
  retry: 'Will try again',
  another_call: 'Waiting for the line',
  daily_limit: 'Daily limit reached; continuing later',
};

const STATUS_TEXT: Record<Errand['status'], string> = {
  queued: 'Waiting',
  calling: 'Calling now',
  done: 'Done',
  needs_you: 'Needs you',
  failed: "Couldn't get through",
  canceled: 'Canceled',
};

export function errandStatusText(e: Errand, now = Date.now()): string {
  if (e.status !== 'queued') return STATUS_TEXT[e.status];
  const base = e.waitingFor ? WAITING_TEXT[e.waitingFor] : STATUS_TEXT.queued;
  return e.nextAttemptAt && e.nextAttemptAt > now + 60_000 ? `${base} · ${whenText(e.nextAttemptAt, now)}` : base;
}

/** "at 3:30 PM", "tomorrow at 9:00 AM", or "Mon at 9:00 AM", in the device's locale and time zone. */
export function whenText(at: number, now = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(d) - day(new Date(now))) / 86_400_000);
  if (days === 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} at ${time}`;
}

export const isActiveErrand = (e: Errand) => e.status === 'queued' || e.status === 'calling';

/** The next weekday morning at 9 (local), for "tomorrow morning" style choices. */
export function nextMorning(now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.getTime();
}
