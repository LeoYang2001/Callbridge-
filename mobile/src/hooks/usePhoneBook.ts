import { useCallback } from 'react';
import type { Contact } from '@shared/types';
import { deleteContact, saveContact } from '@/lib/api';
import { pickContact, type PickedContact } from '@/lib/contacts';
import { useSignedIn } from '@/lib/session';

export interface ContactInput {
  name: string;
  phone: string;
  relationship?: string;
  language?: string;
  address?: string;
}

/**
 * The phone book: kept on the server with the profile (calls add to it on their own), edited
 * here, and filled from the phone's contacts one person at a time.
 */
export function usePhoneBook() {
  const { conn, me, setMe } = useSignedIn();
  const contacts = [...me.profile.contacts].sort((a, b) => a.name.localeCompare(b.name));

  const run = useCallback(
    async (fn: () => Promise<typeof me>) => {
      try {
        setMe(await fn());
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [setMe],
  );

  return {
    contacts,
    /** Each returns an error message to show, or null. */
    save: (input: ContactInput, id?: string) => run(() => saveContact(conn, input, id)),
    remove: (id: string) => run(() => deleteContact(conn, id)),
    /** Opens the phone's contact picker; the caller chooses a number if there are several. */
    pickFromDevice: (): Promise<PickedContact | null> => pickContact(),
  };
}
