import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { displayPhone, usNationalDigits } from '@shared/phone';
import type { Contact } from '@shared/types';
import { useGlow } from '@/glow/GlowContext';
import { usePhoneBook } from '@/hooks/usePhoneBook';
import type { PickedContact } from '@/lib/contacts';
import { color, type } from '@/theme/tokens';
import { Chip, PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Screen, TopBar } from '@/ui/Screen';

const RELATIONSHIPS = ['family', 'friend', 'partner', 'work', 'doctor', 'business'];

/**
 * Import from the phone's contacts, one person at a time through the system picker (only the
 * person picked is read). Choose a number if they have several, say who they are and what
 * language to call them in; a number already in the phone book updates that contact instead.
 */
export default function Import() {
  useGlow('none');
  const book = usePhoneBook();
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [relationship, setRelationship] = useState('');
  const [language, setLanguage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  const pick = async () => {
    setError(null);
    try {
      const p = await book.pickFromDevice();
      if (!p) return;
      const usable = p.phones.filter((x) => usNationalDigits(x.number).length === 10);
      if (!usable.length) return setError(`${p.name || 'That contact'} has no US phone number.`);
      setPicked({ ...p, phones: usable });
      setNumber(usable.length === 1 ? usable[0]!.number : null);
      setRelationship('');
      setLanguage('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const e164 = number ? `+1${usNationalDigits(number)}` : null;
  const existing: Contact | undefined = e164 ? book.contacts.find((c) => c.phone === e164) : undefined;

  const save = async (update: boolean) => {
    if (!picked || !e164) return;
    setBusy(true);
    const err = await book.save(
      { name: picked.name || displayPhone(e164), phone: e164, relationship: relationship || existing?.relationship, language: language || existing?.language },
      update ? existing?.id : undefined,
    );
    setBusy(false);
    if (err) return setError(err);
    setAdded((a) => [...a, picked.name]);
    setPicked(null);
  };

  return (
    <Screen
      top={
        <TopBar
          left={
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/contacts'))} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Icon name="back" size={14} color={color.blue} />
              <Text style={[type.small, { color: color.blue, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>Phone book</Text>
            </Pressable>
          }
        />
      }
      title="Import contacts"
      padding={22}
      scroll
    >
      <Text style={type.sub}>Pick someone from your contacts. CallBridge only reads the person you pick.</Text>
      {added.length ? <Text style={[type.small, { color: color.greenText }]}>Added {added.join(', ')}.</Text> : null}

      {!picked ? (
        <PillButton title={added.length ? 'Pick another' : 'Pick from contacts'} onPress={() => void pick()} />
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={type.h3}>{picked.name}</Text>
          {picked.phones.length > 1 ? (
            <View style={{ gap: 8 }}>
              <Text style={[type.caption, { fontWeight: '600' }]}>Which number?</Text>
              {picked.phones.map((p) => (
                <Pressable key={p.number} onPress={() => setNumber(p.number)} style={[s.radio, number === p.number && s.radioOn]}>
                  <View style={[s.dot, number === p.number && s.dotOn]} />
                  <Text style={[type.callout, { flex: 1 }]}>{displayPhone(`+1${usNationalDigits(p.number)}`)}</Text>
                  {p.label ? <Text style={type.caption}>{p.label}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={[type.caption, { fontWeight: '600' }]}>Who they are to you</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {RELATIONSHIPS.map((r) => (
              <Chip key={r} title={r} selected={relationship === r} onPress={() => setRelationship(relationship === r ? '' : r)} />
            ))}
          </View>
          <TextInput value={relationship} onChangeText={setRelationship} placeholder="or type: mom, girlfriend, dentist…" placeholderTextColor={color.tertiary} style={s.input} />
          <Text style={[type.caption, { fontWeight: '600' }]}>Call them in</Text>
          <TextInput value={language} onChangeText={setLanguage} placeholder="English" placeholderTextColor={color.tertiary} style={s.input} />
          {existing ? (
            <View style={s.dupe}>
              <Text style={[type.callout, { color: color.amberText, fontWeight: '600' }]}>Already in your phone book as {existing.name}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PillButton title="Update existing" kind="black" height={44} onPress={() => void save(true)} busy={busy} style={{ flex: 1 }} />
                <PillButton title="Skip" kind="white" height={44} onPress={() => setPicked(null)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <PillButton title="Add to phone book" onPress={() => void save(false)} busy={busy} disabled={!number} />
          )}
        </View>
      )}
      {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: color.line, paddingHorizontal: 16, backgroundColor: color.white },
  radioOn: { borderColor: color.blue, borderWidth: 2 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color.lineStrong },
  dotOn: { borderColor: color.blue, borderWidth: 6 },
  input: { ...type.callout, height: 50, borderRadius: 16, backgroundColor: color.surface, paddingHorizontal: 16 },
  dupe: { borderWidth: 1.5, borderColor: color.amberGlow, backgroundColor: color.amberTint, borderRadius: 18, padding: 14, gap: 10 },
});
