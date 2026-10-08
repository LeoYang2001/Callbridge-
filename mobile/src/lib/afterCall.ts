import { getDefaultCalendarSync, requestCalendarPermissions } from 'expo-calendar';
import { Linking, Platform } from 'react-native';
import type { CallRecord } from '@shared/types';

/**
 * What a result can do next: put the booked appointment in the phone's calendar (through the
 * system's own "new event" sheet, with write-only access: CallBridge never reads the calendar),
 * and open directions to the place.
 */

/** A wall-clock date and time in `timeZone` as an instant (appointments are saved that way). */
export function zonedDate(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const asUtc = Date.UTC(y!, mo! - 1, d!, h, mi);
  // How far that zone is from UTC at that moment, from what the clock there would read.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(asUtc - (shown - asUtc));
}

/** Opens the system's new-event sheet filled in from the booked appointment. Returns an error to show, or null. */
export async function addToCalendar(call: CallRecord): Promise<string | null> {
  const a = call.result?.appointment;
  if (!a) return 'There is no appointment to add.';
  try {
    const { granted } = await requestCalendarPermissions(true);
    if (!granted) return 'Allow CallBridge to add events in Settings › Privacy › Calendars.';
    const start = zonedDate(a.date, a.time, call.request.timezone);
    const who = call.request.counterpartName || call.request.to;
    await getDefaultCalendarSync().addEventWithForm({
      title: `${a.notes || 'Appointment'} · ${who}`,
      startDate: start,
      endDate: new Date(start.getTime() + 60 * 60_000),
      location: call.request.counterpartAddress,
      notes: [call.result?.summaryInUserLanguage, call.result?.appointmentConfirmedByCounterpart === false ? 'Not confirmed by them yet.' : null, `Booked by CallBridge · ${call.request.to}`]
        .filter(Boolean)
        .join('\n'),
      alarms: [{ relativeOffset: -60 }],
    });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Where to navigate to: the saved address, or the place's name for Maps to search. */
export const destinationOf = (call: CallRecord) => call.request.counterpartAddress?.trim() || (call.request.category === 'personal_call' ? '' : call.request.counterpartName?.trim() || '');

export async function openDirections(destination: string) {
  const q = encodeURIComponent(destination);
  const url = Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  await Linking.openURL(url);
}
