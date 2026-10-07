import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { displayPhone } from '../../../shared/phone';
import { REALTIME_VOICES, WEEKDAYS, type CallRecord, type Contact, type UserProfile } from '../../../shared/types';
import { describeAvailability, isValidDate, isValidTime } from '../policy/availability';
import { sensitiveTextReason } from '../policy/sensitive';
import { blockedReason, normalizePhone } from '../util/phone';
import { isValidTimeZone, localToday } from '../util/time';

export const emptyProfile = (): UserProfile => ({
  name: '',
  preferredLanguage: 'English',
  otherLanguages: [],
  timezone: 'America/Chicago',
  usualAvailability: [],
  shareable: [],
  preferences: [],
  contacts: [],
  appointments: [],
  history: [],
  onboarded: false,
});

const text = (max: number) => z.string().trim().max(max);
const Window = z
  .object({ days: z.array(z.enum(WEEKDAYS)).min(1), start: z.string().refine(isValidTime), end: z.string().refine(isValidTime) })
  .refine((w) => w.start < w.end, 'ends before it starts');

/** What the user (or the profile interview, on their behalf) may change. */
export const ProfilePatchSchema = z
  .object({
    name: text(80),
    pronouns: text(40),
    preferredLanguage: text(60).min(1),
    otherLanguages: z.array(text(60)).max(10),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    defaultCallLanguage: text(60),
    voice: z.enum(REALTIME_VOICES),
    usualAvailability: z.array(Window).max(10),
    shareable: z.array(z.object({ label: text(60).min(1), value: text(300).min(1) })).max(20),
    preferences: z.array(text(200)).max(30),
    onboarded: z.boolean(),
    // Lists the user can prune (the app sends the list without the deleted items).
    contacts: z.array(z.object({ id: z.string() }).passthrough()).max(500),
    appointments: z.array(z.object({ id: z.string() }).passthrough()).max(200),
    history: z.array(z.object({ callId: z.string() }).passthrough()).max(1000),
  })
  .partial();

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

/**
 * Applies a validated patch. Card numbers, SSNs, and passwords are refused, never stored.
 * Contacts, appointments, and history can only shrink here (deletions); calls add to them.
 */
export function applyProfilePatch(profile: UserProfile, patch: ProfilePatch): { profile: UserProfile } | { error: string } {
  for (const [where, value] of [
    ...(patch.shareable ?? []).map((f) => [`"${f.label}"`, `${f.label} ${f.value}`] as const),
    ...(patch.preferences ?? []).map((p) => ['a preference', p] as const),
  ]) {
    const reason = sensitiveTextReason(value);
    if (reason) return { error: `Not saved: ${where} — ${reason}. CallBridge never stores that.` };
  }
  // Lists only shrink here: keep the items whose ids the app sent back.
  const { contacts, appointments, history, ...fields } = patch;
  const ids = (xs?: { id: string }[]) => (xs ? new Set(xs.map((x) => x.id)) : null);
  const contactIds = ids(contacts);
  const appointmentIds = ids(appointments);
  const historyKeys = history ? new Set(history.map((h) => `${h.callId}:${String(h.at)}`)) : null;
  const next: UserProfile = {
    ...profile,
    ...fields,
    contacts: contactIds ? profile.contacts.filter((c) => contactIds.has(c.id)) : profile.contacts,
    appointments: appointmentIds ? profile.appointments.filter((a) => appointmentIds.has(a.id)) : profile.appointments,
    history: historyKeys ? profile.history.filter((h) => historyKeys.has(`${h.callId}:${h.at}`)) : profile.history,
  };
  return { profile: next };
}

export const ContactInputSchema = z.object({
  name: text(80).min(1, 'Enter a name'),
  phone: z.string().max(32),
  relationship: text(60).optional(),
  language: text(60).optional(),
  notes: z.array(text(200)).max(10).optional(),
});
export type ContactInput = z.infer<typeof ContactInputSchema>;

/** Adds or edits a phone book entry (id given = edit). Returns the new profile or an error. */
export function saveContact(profile: UserProfile, input: ContactInput, id?: string): { profile: UserProfile; contact: Contact } | { error: string } {
  const phone = normalizePhone(input.phone);
  if (!phone || blockedReason(phone)) return { error: 'Enter a valid phone number.' };
  for (const note of input.notes ?? []) {
    const reason = sensitiveTextReason(note);
    if (reason) return { error: `Not saved: a note — ${reason}.` };
  }
  const duplicate = profile.contacts.find((c) => c.phone === phone && c.id !== id);
  if (duplicate) return { error: `${duplicate.name} already has this number.` };
  const existing = id ? profile.contacts.find((c) => c.id === id) : undefined;
  if (id && !existing) return { error: 'That contact no longer exists.' };
  const contact: Contact = {
    ...(existing ?? { id: randomUUID(), notes: [], callCount: 0 }),
    name: input.name,
    phone,
    relationship: input.relationship || undefined,
    language: input.language || undefined,
    notes: input.notes ?? existing?.notes ?? [],
  };
  const contacts = existing ? profile.contacts.map((c) => (c.id === id ? contact : c)) : [...profile.contacts, contact];
  return { profile: { ...profile, contacts }, contact };
}

const KIND: Record<string, string> = {
  healthcare_appointment: 'clinic',
  reservation: 'restaurant',
  service_request: 'service',
  personal_call: 'personal',
};
const dedupe = (xs: string[]) => [...new Map(xs.map((x) => [x.trim().toLowerCase(), x.trim()])).values()].filter(Boolean);

/**
 * Records what a finished call taught us: the contact (number, notes, last outcome), a booked
 * appointment, and the decisions the user made. Notes about the other party are kept as notes,
 * never as permissions.
 */
export function learnFromCall(profile: UserProfile, record: CallRecord): UserProfile {
  const req = record.request;
  const r = record.result;
  const name = req.counterpartName?.trim() || displayPhone(req.to);
  const contacts = [...profile.contacts];
  const i = contacts.findIndex((c) => c.phone === req.to);
  const previous: Contact = i >= 0 ? contacts[i]! : { id: randomUUID(), name, phone: req.to, notes: [], callCount: 0 };
  const contact: Contact = {
    ...previous,
    // A name the user gave the contact (or an earlier call) sticks; a new contact takes this call's.
    name: i >= 0 ? previous.name : name,
    relationship: previous.relationship ?? req.counterpartRelationship?.trim(),
    kind: previous.kind ?? (req.category ? KIND[req.category] : undefined),
    language: req.callLanguage || previous.language,
    notes: dedupe([...previous.notes, ...(r?.counterpartNotes ?? [])]).slice(-10),
    lastCalledAt: record.createdAt,
    lastOutcome: r?.headlineInUserLanguage ?? r?.summaryInUserLanguage ?? previous.lastOutcome,
    callCount: previous.callCount + 1,
  };
  if (i >= 0) contacts[i] = contact;
  else contacts.push(contact);

  const today = localToday(profile.timezone).date;
  const appointments = profile.appointments.filter((a) => a.date >= today && a.callId !== record.id);
  if (r?.appointment && isValidDate(r.appointment.date)) {
    appointments.push({
      id: randomUUID(),
      date: r.appointment.date,
      time: r.appointment.time,
      with: contact.name,
      description: r.appointment.notes ?? '',
      callId: record.id,
      needsConfirmation: r.appointmentConfirmedByCounterpart === false || undefined,
    });
  }
  appointments.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const decided = (record.questions ?? [])
    .filter((q) => q.status === 'answered')
    .map((q) => ({
      at: q.answer!.at,
      callId: record.id,
      text: `${contact.name}: ${q.answer!.decision === 'approve' ? 'approved' : q.answer!.decision === 'decline' ? 'declined' : `answered "${q.answer!.text}" to`} "${q.question}"`,
    }));

  return { ...profile, contacts, appointments, history: [...profile.history, ...decided].slice(-200) };
}

/** The saved profile, for the intake assistant's instructions. Data, not instructions. */
export function profileForPrompt(profile: UserProfile): string {
  const lines: string[] = [];
  if (profile.otherLanguages.length) lines.push(`- Also speaks: ${profile.otherLanguages.join(', ')}`);
  if (profile.defaultCallLanguage) lines.push(`- Usual call language: ${profile.defaultCallLanguage}`);
  if (profile.usualAvailability.length) lines.push(`- Usually available: ${describeAvailability(profile.usualAvailability)}`);
  if (profile.shareable.length) lines.push(`- Has said these may be shared when relevant: ${profile.shareable.map((f) => `${f.label}: ${f.value}`).join('; ')}`);
  if (profile.preferences.length) lines.push(`- Preferences: ${profile.preferences.join('; ')}`);
  const contacts = [...profile.contacts].sort((a, b) => (b.lastCalledAt ?? 0) - (a.lastCalledAt ?? 0)).slice(0, 50);
  if (contacts.length) {
    lines.push('- Phone book:');
    for (const c of contacts) {
      lines.push(`  - ${c.name}${c.relationship ? ` (${c.relationship})` : c.kind ? ` (${c.kind})` : ''}: ${displayPhone(c.phone)}${c.language ? `; calls in ${c.language}` : ''}${c.notes.length ? `; notes: ${c.notes.join(' ')}` : ''}${c.lastOutcome ? `; last call: ${c.lastOutcome}` : ''}`);
    }
  }
  if (profile.appointments.length) {
    lines.push(`- Upcoming appointments: ${profile.appointments.map((a) => `${a.date} ${a.time} with ${a.with}${a.needsConfirmation ? ' (needs confirming)' : ''}`).join('; ')}`);
  }
  return lines.length ? lines.join('\n') : '- Nothing saved yet.';
}
