import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Contact, TranslatedCallRecord, UserProfile } from '../../../shared/types';
import { blockedReason, normalizePhone } from '../util/phone';
import { isValidTimeZone } from '../util/time';

export const emptyProfile = (): UserProfile => ({
  name: '',
  preferredLanguage: 'English',
  otherLanguages: [],
  timezone: 'America/Chicago',
  contacts: [],
  onboarded: false,
});

/** A stored profile with only today's fields (accounts made before the redesign carry old ones). */
export function storedProfile(raw: Record<string, unknown>): UserProfile {
  const p = { ...emptyProfile(), ...raw } as UserProfile;
  return {
    name: p.name,
    ...(p.pronouns ? { pronouns: p.pronouns } : {}),
    preferredLanguage: p.preferredLanguage,
    otherLanguages: p.otherLanguages,
    timezone: p.timezone,
    ...(p.defaultCallLanguage ? { defaultCallLanguage: p.defaultCallLanguage } : {}),
    ...(p.useOwnCallerId !== undefined ? { useOwnCallerId: p.useOwnCallerId } : {}),
    ...(p.callerIdVerifiedAt ? { callerIdVerifiedAt: p.callerIdVerifiedAt } : {}),
    contacts: p.contacts.map(({ id, name, phone, kind, relationship, address, language, notes, lastCalledAt, callCount }) => ({
      id, name, phone, kind, relationship, address, language, notes: notes ?? [], lastCalledAt, callCount: callCount ?? 0,
    })),
    onboarded: p.onboarded,
  };
}

const text = (max: number) => z.string().trim().max(max);

/** What the user may change. */
export const ProfilePatchSchema = z
  .object({
    name: text(80),
    pronouns: text(40),
    preferredLanguage: text(60).min(1),
    otherLanguages: z.array(text(60)).max(10),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    defaultCallLanguage: text(60),
    useOwnCallerId: z.boolean(),
    onboarded: z.boolean(),
    // The app sends the list without the deleted contacts.
    contacts: z.array(z.object({ id: z.string() }).passthrough()).max(500),
  })
  .partial();

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

/** Applies a validated patch. Contacts can only shrink here (deletions); see saveContact. */
export function applyProfilePatch(profile: UserProfile, patch: ProfilePatch): { profile: UserProfile } {
  const { contacts, ...fields } = patch;
  const keep = contacts ? new Set(contacts.map((c) => c.id)) : null;
  return { profile: { ...profile, ...fields, contacts: keep ? profile.contacts.filter((c) => keep.has(c.id)) : profile.contacts } };
}

export const ContactInputSchema = z.object({
  name: text(80).min(1, 'Enter a name'),
  phone: z.string().max(32),
  relationship: text(60).optional(),
  address: text(200).optional(),
  language: text(60).optional(),
  notes: z.array(text(200)).max(10).optional(),
});
export type ContactInput = z.infer<typeof ContactInputSchema>;

/** Adds or edits a phone book entry (id given = edit). Returns the new profile or an error. */
export function saveContact(profile: UserProfile, input: ContactInput, id?: string): { profile: UserProfile; contact: Contact } | { error: string } {
  const phone = normalizePhone(input.phone);
  if (!phone || blockedReason(phone)) return { error: 'Enter a valid phone number.' };
  const duplicate = profile.contacts.find((c) => c.phone === phone && c.id !== id);
  if (duplicate) return { error: `${duplicate.name} already has this number.` };
  const existing = id ? profile.contacts.find((c) => c.id === id) : undefined;
  if (id && !existing) return { error: 'That contact no longer exists.' };
  const contact: Contact = {
    ...(existing ?? { id: randomUUID(), notes: [], callCount: 0 }),
    name: input.name,
    phone,
    relationship: input.relationship || undefined,
    address: input.address ?? existing?.address,
    language: input.language || undefined,
    notes: input.notes ?? existing?.notes ?? [],
  };
  const contacts = existing ? profile.contacts.map((c) => (c.id === id ? contact : c)) : [...profile.contacts, contact];
  return { profile: { ...profile, contacts }, contact };
}

/**
 * A finished call keeps the phone book current: the contact's last call and language, or a new
 * contact for a named number that connected. A call nobody answered adds nothing (the number
 * may be mistyped).
 */
export function learnFromCall(profile: UserProfile, record: TranslatedCallRecord): UserProfile {
  const req = record.request;
  const contacts = [...profile.contacts];
  const i = contacts.findIndex((c) => c.phone === req.to);
  if (i < 0 && (!record.answeredAt || !req.contactName?.trim())) return profile;
  const previous: Contact = i >= 0 ? contacts[i]! : { id: randomUUID(), name: req.contactName!.trim(), phone: req.to, notes: [], callCount: 0 };
  const contact: Contact = { ...previous, language: req.theirLanguage || previous.language, lastCalledAt: record.createdAt, callCount: previous.callCount + 1 };
  if (i >= 0) contacts[i] = contact;
  else contacts.push(contact);
  return { ...profile, contacts };
}
