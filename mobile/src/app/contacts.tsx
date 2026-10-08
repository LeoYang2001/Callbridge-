import { router } from 'expo-router';
import { useState } from 'react';
import { displayPhone, formatUsPhone, usNationalDigits } from '@shared/phone';
import type { Contact } from '@shared/types';
import { usePhoneBook, type ContactInput } from '@/hooks/usePhoneBook';
import type { PickedContact } from '@/lib/contacts';
import { Body, Button, Card, Choice, ErrorText, Field, Row, Screen, Title } from '@/ui/placeholder';

/** The phone book: people and places to call by name ("call my mom"). Calls add to it on their own. */
export default function PhoneBook() {
  const book = usePhoneBook();
  const [editing, setEditing] = useState<{ id?: string; input: ContactInput } | null>(null);
  /** A picked contact with several numbers: choose one. */
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fromDevice = async () => {
    setError(null);
    try {
      const p = await book.pickFromDevice();
      if (!p) return;
      if (p.phones.length === 0) return setError(`${p.name} has no phone number.`);
      if (p.phones.length === 1) setEditing({ input: { name: p.name, phone: p.phones[0]!.number } });
      else setPicked(p);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (editing) return <ContactForm initial={editing.input} id={editing.id} onDone={() => setEditing(null)} />;

  return (
    <Screen>
      <Row>
        <Button title="Add from my contacts" onPress={fromDevice} />
        <Button kind="plain" title="Add by hand" onPress={() => setEditing({ input: { name: '', phone: '' } })} />
      </Row>
      <ErrorText>{error}</ErrorText>
      {picked && (
        <Card>
          <Body>Which number for {picked.name}?</Body>
          {picked.phones.map((p) => (
            <Button key={p.number} kind="plain" title={`${p.label ? `${p.label}: ` : ''}${p.number}`} onPress={() => {
              setPicked(null);
              setEditing({ input: { name: picked.name, phone: p.number } });
            }} />
          ))}
        </Card>
      )}
      {book.contacts.length === 0 && <Body muted>No one yet. People you call are added here after the call.</Body>}
      {book.contacts.map((c) => (
        <ContactRow key={c.id} c={c} onCall={() => router.push({ pathname: '/intake', params: { contact: c.id } })} onEdit={() => setEditing({ id: c.id, input: { name: c.name, phone: c.phone, relationship: c.relationship, language: c.language, address: c.address } })} />
      ))}
    </Screen>
  );
}

function ContactRow({ c, onCall, onEdit }: { c: Contact; onCall: () => void; onEdit: () => void }) {
  return (
    <Card>
      <Body>
        {c.name}
        {c.relationship ? ` · ${c.relationship}` : ''}
      </Body>
      <Body muted>{displayPhone(c.phone)}{c.address ? ` · ${c.address}` : ''}</Body>
      <Row>
        <Button title="Call" onPress={onCall} />
        <Button kind="plain" title="Edit" onPress={onEdit} />
      </Row>
    </Card>
  );
}

const RELATIONSHIPS = ['', 'partner', 'family', 'friend', 'work', 'doctor', 'business'] as const;

function ContactForm({ initial, id, onDone }: { initial: ContactInput; id?: string; onDone: () => void }) {
  const book = usePhoneBook();
  const [input, setInput] = useState<ContactInput>({ ...initial, phone: usNationalDigits(initial.phone) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ContactInput>) => setInput((i) => ({ ...i, ...patch }));

  const save = async () => {
    setBusy(true);
    const err = await book.save({ ...input, phone: `+1${input.phone}` }, id);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <Screen>
      <Title>{id ? 'Edit contact' : 'New contact'}</Title>
      <Field label="Name" value={input.name} onChangeText={(name) => set({ name })} />
      <Field label="Phone (+1)" value={formatUsPhone(input.phone)} onChangeText={(t) => set({ phone: usNationalDigits(t) })} keyboardType="phone-pad" />
      <Field label="Who they are to you (e.g. girlfriend, mom, dentist)" value={input.relationship ?? ''} onChangeText={(relationship) => set({ relationship })} />
      <Choice options={RELATIONSHIPS} value={(RELATIONSHIPS as readonly string[]).includes(input.relationship ?? '') ? (input.relationship as (typeof RELATIONSHIPS)[number]) ?? '' : ''} onChange={(relationship) => set({ relationship })} labels={{ '': 'none' }} />
      <Field label="Language to call them in" value={input.language ?? ''} onChangeText={(language) => set({ language })} placeholder="English" />
      <Field label="Address (tells same-name places apart)" value={input.address ?? ''} onChangeText={(address) => set({ address })} />
      <Button title="Save" onPress={save} busy={busy} disabled={!input.name.trim() || input.phone.length !== 10} />
      {id && (
        <Button kind="danger" title="Delete" onPress={async () => {
          const err = await book.remove(id);
          if (err) setError(err);
          else onDone();
        }} />
      )}
      <Button kind="plain" title="Cancel" onPress={onDone} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
