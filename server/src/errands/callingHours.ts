import type { TaskCategory } from '../../../shared/types';
import { localToday } from '../util/time';

/**
 * When the errand queue may call, in the user's time zone. The queue doesn't know a business's
 * real opening hours, so it sticks to hours when almost everything is open and staffed, and a
 * closed business is handled like no answer (try again later).
 */

interface Window {
  days: string[];
  start: string;
  end: string;
}

const EVERY_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const CALLING_HOURS: Record<'business' | 'personal', Window> = {
  business: { days: EVERY_DAY.slice(0, 6), start: '09:00', end: '18:00' },
  personal: { days: EVERY_DAY, start: '09:00', end: '21:00' },
};

export const callingHoursFor = (category?: TaskCategory) => CALLING_HOURS[category === 'personal_call' ? 'personal' : 'business'];

const STEP_MS = 5 * 60_000;
/** A week and a day: every window repeats within a week. */
const HORIZON_MS = 8 * 86_400_000;

export function isWithin(window: Window, timezone: string, at: number): boolean {
  const { weekday, time } = localToday(timezone, new Date(at));
  return window.days.includes(weekday) && time >= window.start && time < window.end;
}

/** `from` if calling is allowed then, otherwise the start of the next allowed stretch (to 5 minutes). */
export function nextCallingTime(window: Window, timezone: string, from: number): number {
  if (isWithin(window, timezone, from)) return from;
  // Step on a 5-minute grid; a window always opens on one (its start is HH:MM).
  let t = Math.ceil(from / STEP_MS) * STEP_MS;
  for (const end = from + HORIZON_MS; t < end; t += STEP_MS) if (isWithin(window, timezone, t)) return t;
  return from; // no window at all: don't hold the errand forever
}
