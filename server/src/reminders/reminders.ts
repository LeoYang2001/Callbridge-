import type { UpcomingAppointment, UserProfile } from '../../../shared/types';
import type { Database } from '../db/database';
import type { PushMessage } from '../push/push';
import { localToday } from '../util/time';

/**
 * Day-before reminders for appointments the assistant booked: a push in the evening (from
 * 18:00 in the user's time zone) the day before, once per appointment. Users can turn them off
 * in Notifications.
 */

const REMIND_FROM = '18:00';

/** "YYYY-MM-DD" + one day, as a calendar date. */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The appointments to remind about now: tomorrow's, in the evening, not reminded yet. */
export function dueReminders(profile: UserProfile, now: Date): UpcomingAppointment[] {
  if (profile.notify?.reminders === false) return [];
  const today = localToday(profile.timezone, now);
  if (today.time < REMIND_FROM) return [];
  const tomorrow = nextDay(today.date);
  return profile.appointments.filter((a) => a.date === tomorrow && !a.remindedAt);
}

export function reminderMessage(a: UpcomingAppointment): Omit<PushMessage, 'to'> {
  const [h = 0, m = 0] = a.time.split(':').map(Number);
  const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { title: `Tomorrow ${time} · ${a.with}`, body: a.description || 'Your appointment is tomorrow.', data: { kind: 'finished', callId: a.callId } };
}

/** Sends what's due and marks it sent. Returns how many went out. */
export function sendDueReminders(db: Database, notify: (userId: string, m: Omit<PushMessage, 'to'>) => void, now = new Date()): number {
  let sent = 0;
  for (const user of db.allUsers()) {
    const due = dueReminders(user.profile, now);
    if (!due.length) continue;
    for (const a of due) {
      notify(user.id, reminderMessage(a));
      sent++;
    }
    const ids = new Set(due.map((a) => a.id));
    db.saveProfile(user.id, { ...user.profile, appointments: user.profile.appointments.map((a) => (ids.has(a.id) ? { ...a, remindedAt: now.getTime() } : a)) });
  }
  return sent;
}
