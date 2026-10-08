import { describe, expect, it } from 'vitest';
import type { UpcomingAppointment } from '../../shared/types';
import { Database } from '../src/db/database';
import { emptyProfile, profileForPrompt } from '../src/profile/profile';
import type { PushMessage } from '../src/push/push';
import { dueReminders, sendDueReminders } from '../src/reminders/reminders';

const appt = (date: string, time = '14:00'): UpcomingAppointment => ({ id: `a-${date}`, date, time, with: 'Smile Dental', description: '洗牙 · bring insurance card', callId: 'c1' });
const profile = (appointments: UpcomingAppointment[], reminders?: boolean) => ({ ...emptyProfile(), timezone: 'America/Chicago', appointments, notify: reminders === undefined ? undefined : { reminders } });

/** Wednesday 2026-10-07 in Chicago at the given local hour (CDT is UTC-5). */
const wed = (hour: number) => new Date(Date.UTC(2026, 9, 7, hour + 5));

describe('appointment reminders', () => {
  it("reminds about tomorrow's appointments in the evening, once", () => {
    const p = profile([appt('2026-10-08'), appt('2026-10-09')]);
    expect(dueReminders(p, wed(12))).toEqual([]);
    expect(dueReminders(p, wed(19)).map((a) => a.date)).toEqual(['2026-10-08']);

    const db = new Database(':memory:');
    const user = db.createUser('+19014553148', p);
    const sent: Omit<PushMessage, 'to'>[] = [];
    expect(sendDueReminders(db, (_u, m) => sent.push(m), wed(19))).toBe(1);
    expect(sent[0]).toMatchObject({ title: 'Tomorrow 2:00 PM · Smile Dental', body: '洗牙 · bring insurance card' });
    expect(sendDueReminders(db, (_u, m) => sent.push(m), wed(20))).toBe(0);
    expect(db.userById(user.id)!.profile.appointments[0]!.remindedAt).toBeGreaterThan(0);
  });

  it('respects the switch in Notifications', () => {
    expect(dueReminders(profile([appt('2026-10-08')], false), wed(19))).toEqual([]);
  });
});

describe('sharing switches', () => {
  it("keeps switched-off facts out of what the assistant is told it may share", () => {
    const p = { ...emptyProfile(), shareable: [{ label: 'Date of birth', value: '1988-03-14' }, { label: 'Insurance', value: 'Aetna', off: true }] };
    const text = profileForPrompt(p);
    expect(text).toContain('Date of birth');
    expect(text).not.toContain('Aetna');
  });
});
