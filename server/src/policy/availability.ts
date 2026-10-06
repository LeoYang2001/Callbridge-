import type { AvailabilityWindow, CallRequest, Weekday } from '../../../shared/types';
import { WEEKDAYS } from '../../../shared/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

/** Day of week for a calendar date. Pure calendar math — independent of server time zone. */
export function weekdayOf(date: string): Weekday {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(jsDay + 6) % 7]!;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};

export interface SlotCheck {
  allowed: boolean;
  reason: string;
}

/**
 * Level 2 enforcement: is a proposed appointment start inside the user's stated availability?
 * The model never decides this on its own — it must ask this function via a tool call.
 */
export function checkSlot(
  constraints: CallRequest['constraints'],
  date: string,
  startTime: string,
  today?: string,
): SlotCheck {
  if (!isValidDate(date)) return { allowed: false, reason: `"${date}" is not a valid YYYY-MM-DD date.` };
  if (!isValidTime(startTime)) return { allowed: false, reason: `"${startTime}" is not a valid 24h HH:MM time.` };
  if (today && date < today) return { allowed: false, reason: `${date} is in the past.` };
  if (constraints.earliestDate && date < constraints.earliestDate)
    return { allowed: false, reason: `The user is not available before ${constraints.earliestDate}.` };
  if (constraints.latestDate && date > constraints.latestDate)
    return { allowed: false, reason: `The user is not available after ${constraints.latestDate}.` };

  if (constraints.availability.length === 0) {
    return { allowed: false, reason: 'The user did not authorize any appointment times. Ask them first.' };
  }

  const day = weekdayOf(date);
  const minutes = toMinutes(startTime);
  const match = constraints.availability.find(
    (w) => w.days.includes(day) && minutes >= toMinutes(w.start) && minutes < toMinutes(w.end),
  );
  if (match) {
    return { allowed: true, reason: `${capitalize(day)} ${date} at ${startTime} is within the user's availability.` };
  }
  return {
    allowed: false,
    reason: `${capitalize(day)} ${date} at ${startTime} is outside the user's availability (${describeAvailability(constraints.availability)}).`,
  };
}

const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function capitalize(day: Weekday) {
  return DAY_NAMES[day];
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function describeAvailability(windows: AvailabilityWindow[]): string {
  if (windows.length === 0) return 'no times authorized';
  return windows
    .map((w) => {
      const days = WEEKDAYS.filter((d) => w.days.includes(d)).map((d) => DAY_NAMES[d]);
      return `${days.join(' or ')} with a start time from ${formatTime(w.start)} up to (not including) ${formatTime(w.end)}`;
    })
    .join('; or ');
}
