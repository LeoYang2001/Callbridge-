import { Contact, requestPermissionsAsync } from 'expo-contacts';

export interface PickedContact {
  name: string;
  phones: { label: string; number: string }[];
}

/**
 * Opens the phone's own contact picker. Only the person picked is read; the app never uploads
 * the address book. Returns null if the user cancelled.
 */
export async function pickContact(): Promise<PickedContact | null> {
  const contact = await Contact.presentPicker();
  if (!contact) return null;
  const read = async () => {
    const [name, phones] = await Promise.all([contact.getFullName(), contact.getPhones()]);
    return { name: name.trim(), phones: phones.filter((p) => p.number).map((p) => ({ label: p.label ?? '', number: p.number! })) };
  };
  try {
    return await read();
  } catch {
    // Reading the picked contact's details can need contacts access on some OS versions.
    const { granted } = await requestPermissionsAsync();
    if (!granted) throw new Error('Allow contacts access in Settings to use the person you picked.');
    return read();
  }
}
