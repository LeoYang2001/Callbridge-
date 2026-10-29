import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { languageCode, nativeLanguageName, searchLanguages } from '@shared/languages';
import { useGlow } from '@/glow/GlowContext';
import { useProfile } from '@/hooks/useProfile';
import { color, type } from '@/theme/tokens';
import { Chip, PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';

/** First-time setup: the user's language, then their name and who they usually call. */
export default function Onboarding() {
  const { profile, update } = useProfile();
  const [picked, setPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!picked) {
    return (
      <LanguageStep
        current={profile.preferredLanguage}
        error={error}
        onPick={async (name) => {
          const err = await update({ preferredLanguage: name });
          if (err) setError(err);
          else setPicked(true);
        }}
      />
    );
  }
  return <NameStep onBackToLanguage={() => setPicked(false)} />;
}

function Header({ step, language }: { step: number; language?: string }) {
  return (
    <View>
      <View style={s.pillRow}>{language ? <Text style={s.langPill}>Language · {nativeLanguageName(language)}</Text> : <View style={{ height: 24 }} />}</View>
      <View style={s.dots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[s.dot, { backgroundColor: i <= step ? color.blue : color.line }]} />
        ))}
      </View>
    </View>
  );
}

function LanguageStep({ current, error, onPick }: { current: string; error: string | null; onPick: (name: string) => void }) {
  useGlow('none');
  const [q, setQ] = useState('');
  const list = useMemo(() => searchLanguages(q), [q]);
  return (
    <Screen top={<Header step={0} />} padding={22}>
      <View style={{ paddingHorizontal: 12, paddingTop: 14, gap: 6 }}>
        <Icon name="globe" size={26} color={color.blue} />
        <Text style={[type.title, { marginTop: 6 }]}>Choose your language</Text>
        <Text style={type.sub}>选择语言 · Elige tu idioma</Text>
      </View>
      <View style={s.search}>
        <Icon name="search" size={17} color={color.secondary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search · 搜索 · Buscar" placeholderTextColor={color.secondary} style={[type.callout, { flex: 1 }]} autoCorrect={false} />
      </View>
      {error ? <Text style={[type.small, { color: color.redText, marginTop: 8 }]}>{error}</Text> : null}
      <FlatList
        data={list}
        keyExtractor={(l) => l.name}
        style={{ marginTop: 12 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={[type.small, { textAlign: 'center', paddingVertical: 30 }]}>No match. Try the name in English or your own script.</Text>}
        ListFooterComponent={<Text style={[type.caption, { textAlign: 'center', marginTop: 8 }]}>You can change this later in Me.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item.name)} style={({ pressed }) => [s.langRow, item.name === current && s.langRowOn, pressed && { opacity: 0.7 }]}>
            <Text style={type.row}>{item.native}</Text>
            <Text style={type.caption}>{item.name}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

/** The second step: their name, so the interpreter can introduce them, and who they usually call. */
function NameStep({ onBackToLanguage }: { onBackToLanguage: () => void }) {
  useGlow('none');
  const { profile, update, finishOnboarding } = useProfile();
  const [name, setName] = useState(profile.name);
  const [usual, setUsual] = useState(profile.defaultCallLanguage ?? 'English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = languageCode(profile.preferredLanguage);
  const choices = ['English', 'Spanish', 'Japanese', 'Korean', 'Chinese (Mandarin)'].filter((l) => languageCode(l) !== own).slice(0, 4);

  const done = async () => {
    setBusy(true);
    const err = await update({ name: name.trim(), defaultCallLanguage: usual });
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    await finishOnboarding();
    router.replace('/');
  };

  return (
    <Screen top={<Header step={2} language={profile.preferredLanguage} />} padding={30}>
      <View style={{ flex: 1, gap: 22, paddingTop: 24 }}>
        <Animated.Text entering={FadeInUp.duration(350)} style={type.title}>
          What's your name?
        </Animated.Text>
        <TextInput value={name} onChangeText={setName} placeholder="So the interpreter can introduce you" placeholderTextColor={color.tertiary} style={s.nameInput} autoFocus autoComplete="given-name" />
        <View style={{ gap: 10 }}>
          <Text style={type.label}>People you call usually speak</Text>
          <View style={s.chips}>
            {choices.map((l) => (
              <Chip key={l} title={l} selected={l === usual} onPress={() => setUsual(l)} />
            ))}
          </View>
        </View>
        {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
      </View>
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <PillButton title="Start calling" kind="blue" busy={busy} disabled={!name.trim()} onPress={() => void done()} />
        <Text style={[type.caption, { textAlign: 'center' }]} onPress={onBackToLanguage}>
          Change language
        </Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  pillRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22, paddingTop: 6 },
  langPill: { ...type.label, textTransform: 'none', letterSpacing: 0, backgroundColor: color.surface, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5, overflow: 'hidden' },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: 34, paddingTop: 12 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  search: { marginTop: 18, height: 50, borderRadius: 16, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  langRow: { minHeight: 62, borderRadius: 18, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  langRowOn: { borderWidth: 2, borderColor: color.blue },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nameInput: { height: 60, borderRadius: 16, borderWidth: 1, borderColor: color.line, backgroundColor: color.white, paddingHorizontal: 16, fontSize: 20, fontWeight: '600', color: color.ink },
});
