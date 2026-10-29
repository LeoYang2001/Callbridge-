import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { LANGUAGES, languageCode } from '@shared/languages';
import { displayPhone, formatUsPhone, usNationalDigits } from '@shared/phone';
import type { Contact } from '@shared/types';
import { useGlow } from '@/glow/GlowContext';
import { startTranslatedCall } from '@/lib/api';
import { canJoinInApp, connectFromApp } from '@/lib/appJoin';
import { haptic } from '@/lib/haptics';
import { useSignedIn } from '@/lib/session';
import { MenuButton } from '@/nav/MenuButton';
import { color, type } from '@/theme/tokens';
import { PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Avatar, Brand } from '@/ui/Identity';
import { Screen, TopBar } from '@/ui/Screen';

/**
 * Home: call someone with translation. The user talks to them directly; captions translate both
 * sides and an AI interpreter can join if they agree. The call goes through the app when this
 * build can place calls (Twilio Voice SDK), else the server rings the user's phone first.
 * ?contact=<id>: calling someone from the phone book.
 */
export default function Dial() {
  useGlow('none');
  const { me, conn } = useSignedIn();
  const { contact } = useLocalSearchParams<{ contact?: string }>();
  const initial = contact ? me.profile.contacts.find((c) => c.id === contact) : undefined;
  const [query, setQuery] = useState(initial?.name ?? '');
  const [picked, setPicked] = useState<Contact | null>(initial ?? null);
  const [language, setLanguage] = useState(initial?.language || me.profile.defaultCallLanguage || 'English');
  const [captions, setCaptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typedDigits = /^[\d\s()+\-.]+$/.test(query.trim()) ? usNationalDigits(query) : '';
  const digits = picked ? usNationalDigits(picked.phone) : typedDigits;
  const q = query.trim().toLowerCase();
  const people = useMemo(() => {
    const all = [...me.profile.contacts].sort((a, b) => (b.lastCalledAt ?? 0) - (a.lastCalledAt ?? 0));
    const matches = q && !picked && !typedDigits ? all.filter((c) => [c.name, c.relationship, c.phone].some((x) => x?.toLowerCase().includes(q))) : all;
    return matches.slice(0, 5);
  }, [me.profile.contacts, q, picked, typedDigits]);

  const own = languageCode(me.profile.preferredLanguage);
  const others = LANGUAGES.filter((l) => languageCode(l) !== own);
  const choices = [...new Set([language, 'English', 'Spanish', 'Japanese', 'Korean'])].filter((l) => languageCode(l) !== own).slice(0, 3);
  const who = picked?.name ?? (digits.length === 10 ? formatUsPhone(digits) : '');

  const pick = (c: Contact) => {
    haptic.select();
    setPicked(c);
    setQuery(c.name);
    if (c.language) setLanguage(c.language);
  };

  const more = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...others, 'Cancel'], cancelButtonIndex: others.length, title: 'They speak' }, (i) => {
        if (i < others.length) setLanguage(others[i]!);
      });
    } else {
      // Android: cycle through the rest (a full picker can come with the design system's sheet).
      const rest = others.filter((l) => !choices.includes(l));
      setLanguage(rest[(rest.indexOf(language) + 1) % rest.length] ?? language);
    }
  };

  const call = async () => {
    setBusy(true);
    setError(null);
    const base = { to: `+1${digits}`, contactName: picked?.name, theirLanguage: language, captions };
    try {
      let started;
      if (canJoinInApp()) {
        try {
          started = await startTranslatedCall(conn, { ...base, join: 'app' });
        } catch (e) {
          // Calling from the app isn't set up on this server: ring the phone instead.
          if (!/isn't set up/.test((e as Error).message)) throw e;
        }
      }
      started ??= await startTranslatedCall(conn, { ...base, join: 'phone' });
      const { record, join } = started;
      if (join) await connectFromApp(join, who || 'CallBridge call', () => {});
      router.push({ pathname: '/translate/[id]', params: { id: record.id, inApp: join ? '1' : '' } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      top={<TopBar left={<Brand />} right={<MenuButton />} />}
      padding={0}
      bottom={
        <View style={s.bottom}>
          {error ? <Text style={[type.small, { color: color.redText, textAlign: 'center' }]}>{error}</Text> : null}
          <PillButton title={busy ? 'Calling…' : who ? `Call ${who}` : 'Call'} kind="green" height={62} busy={busy} disabled={digits.length !== 10} onPress={() => void call()} icon={<Icon name="phone" size={18} color={color.white} />} />
          <Text style={[type.caption, { textAlign: 'center' }]}>{captions ? 'Captions on · ' : ''}{canJoinInApp() ? 'the call goes through this app' : `we ring your phone (${displayPhone(me.phone)}) first`}</Text>
        </View>
      }
    >
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ gap: 6 }}>
          <Text style={[type.title, { fontWeight: '800' }]} accessibilityRole="header">
            Who are you calling?
          </Text>
          <Text style={type.sub}>You talk to them yourself. Captions translate both sides.</Text>
        </View>

        <View style={s.search}>
          <Icon name="search" size={18} color={color.secondary} />
          <TextInput
            value={typedDigits && !picked ? formatUsPhone(typedDigits) : query}
            onChangeText={(t) => {
              setQuery(t);
              setPicked(null);
            }}
            placeholder="Name or phone number"
            placeholderTextColor={color.tertiary}
            style={s.searchInput}
            autoCorrect={false}
            accessibilityLabel="Name or phone number"
          />
        </View>

        {people.length ? (
          <View style={{ gap: 8 }}>
            <Text style={type.label}>{q && !picked ? 'Contacts' : 'Recent'}</Text>
            <View style={s.people}>
              {people.map((c, i) => {
                const on = picked?.id === c.id;
                return (
                  <Pressable key={c.id} onPress={() => pick(c)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.person, i > 0 && s.divider, on && { backgroundColor: color.blueTint }]}>
                    <Avatar name={c.name} on={on} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { fontSize: 16 }]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={type.caption} numberOfLines={1}>
                        {[c.language, c.relationship ?? displayPhone(c.phone)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {on ? <Icon name="check" size={20} color={color.blue} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={type.label}>They speak</Text>
          <View style={s.chips}>
            {choices.map((l) => (
              <LangChip key={l} title={l} on={l === language} onPress={() => setLanguage(l)} />
            ))}
            <LangChip title={choices.includes(language) ? 'More' : language} on={!choices.includes(language)} onPress={more} />
          </View>
        </View>

        <View style={s.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>Captions from the start</Text>
            <Text style={type.caption}>Turn them on or off any time.</Text>
          </View>
          <Switch value={captions} onValueChange={setCaptions} trackColor={{ true: color.green, false: color.line }} accessibilityLabel="Captions from the start" />
        </View>
      </ScrollView>
    </Screen>
  );
}

function LangChip({ title, on, onPress }: { title: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={[s.chip, on && s.chipOn]}
    >
      <Text style={[type.callout, { fontWeight: on ? '700' : '600', color: on ? color.teal : color.ink }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 20 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: 16, paddingHorizontal: 16, height: 58 },
  searchInput: { flex: 1, fontSize: 18, fontWeight: '600', color: color.ink },
  people: { backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: 18, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.white, justifyContent: 'center' },
  chipOn: { borderWidth: 2, borderColor: color.teal, backgroundColor: color.tealTint },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: 16, padding: 14 },
  bottom: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
});
