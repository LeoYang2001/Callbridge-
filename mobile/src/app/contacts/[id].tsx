import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { displayPhone, formatUsPhone, usNationalDigits } from '@shared/phone';
import { useGlow } from '@/glow/GlowContext';
import { usePhoneBook, type ContactInput } from '@/hooks/usePhoneBook';
import { color, type } from '@/theme/tokens';
import { Avatar } from '@/ui/Avatar';
import { PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Group, Row, SectionLabel } from '@/ui/Rows';
import { Pill } from '@/ui/Text';
import { Screen, TopBar } from '@/ui/Screen';

/** One contact: call them, what the assistant knows, the last call, and what calls taught it. */
export default function ContactScreen() {
  useGlow('none');
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = usePhoneBook();
  const c = book.contacts.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/contacts'))} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon name="back" size={14} color={color.blue} />
      <Text style={[type.small, { color: color.blue, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>Phone book</Text>
    </Pressable>
  );
  if (!c) {
    return (
      <Screen top={<TopBar left={back} />}>
        <Text style={type.sub}>This contact was deleted.</Text>
      </Screen>
    );
  }
  if (editing) return <EditContact initial={{ name: c.name, phone: c.phone, relationship: c.relationship, language: c.language, address: c.address }} id={c.id} onDone={() => setEditing(false)} />;

  return (
    <Screen
      top={
        <TopBar
          left={back}
          right={
            <Text style={[type.small, { color: color.blue, fontWeight: '600' }]} onPress={() => setEditing(true)}>
              Edit
            </Text>
          }
        />
      }
      padding={22}
      scroll
    >
      <View style={{ alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Avatar name={c.name} size={84} />
        <Text style={[type.h2, { textAlign: 'center' }]}>{c.name}</Text>
        {c.relationship ? <Pill>{c.relationship}</Pill> : null}
      </View>
      <PillButton title="Call with the assistant" kind="green" onPress={() => router.push({ pathname: '/', params: { contact: c.id } })} icon={<Icon name="phone" size={17} color={color.white} />} style={{ marginTop: 8 }} />
      <Group>
        <Row label="Number" value={displayPhone(c.phone)} />
        <Row label="Speaks" value={c.language || 'English'} />
        <Row label="Address" value={c.address || '—'} last />
      </Group>
      {c.lastOutcome ? (
        <>
          <SectionLabel>Last call</SectionLabel>
          <View style={{ backgroundColor: color.greenTint, borderRadius: 18, padding: 14, gap: 4 }}>
            <Text style={[type.callout, { color: color.greenText, fontWeight: '600' }]}>{c.lastOutcome}</Text>
            {c.lastCalledAt ? <Text style={[type.caption, { color: color.greenText }]}>{new Date(c.lastCalledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text> : null}
          </View>
        </>
      ) : null}
      {c.notes.length ? (
        <>
          <SectionLabel>Learned on calls</SectionLabel>
          <Group>
            {c.notes.map((n, i) => (
              <Row key={n} label={n} last={i === c.notes.length - 1} />
            ))}
          </Group>
        </>
      ) : null}
      {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
      <Text
        style={[type.small, { color: color.redText, textAlign: 'center', marginTop: 12 }]}
        onPress={() =>
          Alert.alert(`Delete ${c.name}?`, 'The assistant forgets this contact and what it learned on calls.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                const err = await book.remove(c.id);
                if (err) setError(err);
                else router.back();
              },
            },
          ])
        }
      >
        Delete contact
      </Text>
    </Screen>
  );
}

/** Name, number, who they are to you, the language to call in, and an address for businesses. */
export function EditContact({ initial, id, onDone, title }: { initial: ContactInput; id?: string; onDone: () => void; title?: string }) {
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
    <Screen
      top={
        <TopBar
          left={
            <Text style={[type.small, { color: color.blue }]} onPress={onDone}>
              Cancel
            </Text>
          }
        />
      }
      padding={22}
      scroll
    >
      <Text style={type.title}>{title ?? (id ? 'Edit contact' : 'New contact')}</Text>
      <Field label="Name" value={input.name} onChange={(name) => set({ name })} />
      <Field label="Phone (+1)" value={formatUsPhone(input.phone)} onChange={(t) => set({ phone: usNationalDigits(t) })} keyboard="phone-pad" />
      <Field label="Who they are to you" value={input.relationship ?? ''} onChange={(relationship) => set({ relationship })} placeholder="mom, girlfriend, dentist…" />
      <Field label="Call them in" value={input.language ?? ''} onChange={(language) => set({ language })} placeholder="English" />
      <Field label="Address (tells same-name places apart)" value={input.address ?? ''} onChange={(address) => set({ address })} />
      {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
      <PillButton title="Save" onPress={() => void save()} busy={busy} disabled={!input.name.trim() || input.phone.length !== 10} />
    </Screen>
  );
}

function Field({ label, value, onChange, placeholder, keyboard }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'phone-pad' }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.caption, { fontWeight: '600' }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.tertiary}
        keyboardType={keyboard}
        style={[type.callout, { height: 50, borderRadius: 16, backgroundColor: color.surface, paddingHorizontal: 16 }]}
      />
    </View>
  );
}
