import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import type { Contact } from '@shared/types';
import { useGlow } from '@/glow/GlowContext';
import { usePhoneBook } from '@/hooks/usePhoneBook';
import { MenuButton } from '@/nav/MenuButton';
import { color, type } from '@/theme/tokens';
import { Avatar } from '@/ui/Avatar';
import { RoundButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Pill } from '@/ui/Text';
import { Screen, ScreenTitle, TopBar } from '@/ui/Screen';

/** The phone book: people and places to call by name ("call my mom"). Calls add to it on their own. */
export default function PhoneBook() {
  useGlow('none');
  const { contacts } = usePhoneBook();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    const digits = t.replace(/\D/g, '');
    return contacts.filter((c) => c.name.toLowerCase().includes(t) || (c.relationship ?? '').toLowerCase().includes(t) || (digits.length >= 3 && c.phone.includes(digits)));
  }, [contacts, q]);

  return (
    <Screen
      top={
        <>
          <TopBar right={<MenuButton />} />
          <ScreenTitle
            title="Phone book"
            right={
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <Text style={[type.small, { color: color.blue, fontWeight: '600' }]} onPress={() => router.push('/contacts/import')} suppressHighlighting>
                  Import
                </Text>
                <Text
                  accessibilityRole="button"
                  accessibilityLabel="Add a contact"
                  style={[type.small, { color: color.blue, fontWeight: '600' }]}
                  onPress={() => router.push({ pathname: '/contacts/[id]', params: { id: 'new' } })}
                  suppressHighlighting
                >
                  + Add
                </Text>
              </View>
            }
          >
            <View style={s.search}>
              <Icon name="search" size={17} color={color.secondary} />
              <TextInput value={q} onChangeText={setQ} placeholder="Name, relationship or number" placeholderTextColor={color.secondary} style={[type.callout, { flex: 1 }]} autoCorrect={false} />
            </View>
          </ScreenTitle>
        </>
      }
      padding={0}
    >
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={[type.sub, { marginTop: 20 }]}>{q ? 'No one matches.' : 'No one yet. People you call are added here after the call, or import them from your contacts.'}</Text>}
        renderItem={({ item }) => <ContactRow c={item} />}
      />
    </Screen>
  );
}

function ContactRow({ c }: { c: Contact }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/contacts/[id]', params: { id: c.id } })} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      <Avatar name={c.name} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[type.bodyStrong, { fontSize: 16, flexShrink: 1 }]} numberOfLines={1}>
            {c.name}
          </Text>
          {c.relationship ? <Pill>{c.relationship}</Pill> : null}
        </View>
        <Text style={type.caption} numberOfLines={1}>
          {[displayPhone(c.phone), c.language, c.callCount ? `${c.callCount} call${c.callCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
        </Text>
        {c.lastOutcome ? (
          <Text style={[type.caption, { color: color.body }]} numberOfLines={1}>
            {c.lastOutcome}
          </Text>
        ) : null}
      </View>
      <RoundButton label={`Call ${c.name}`} onPress={() => router.push({ pathname: '/', params: { contact: c.id } })} size={40} bg={color.green} ring={false}>
        <Icon name="phone" size={17} color={color.white} />
      </RoundButton>
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  search: { height: 48, borderRadius: 16, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.divider },
});
