import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { nativeLanguageName, searchLanguages } from '@shared/languages';
import { useGlow } from '@/glow/GlowContext';
import { useIntake } from '@/hooks/useIntake';
import { useIntakeContext } from '@/hooks/useIntakeContext';
import { useProfile } from '@/hooks/useProfile';
import { color, type } from '@/theme/tokens';
import { Chip, PillButton } from '@/ui/Button';
import { HoldToTalk } from '@/ui/HoldToTalk';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';

/**
 * The profile interview. Step 1 is a plain language picker (no voice, no glow). Then the
 * assistant asks three questions by voice in that language (name, voice, main use), with
 * answers to tap; the user holds the button to speak.
 */
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
  return <Interview onBackToLanguage={() => setPicked(false)} />;
}

function Header({ step, language }: { step: number; language?: string }) {
  return (
    <View>
      <View style={s.pillRow}>{language ? <Text style={s.langPill}>Language · {nativeLanguageName(language)}</Text> : <View style={{ height: 24 }} />}</View>
      <View style={s.dots}>
        {[0, 1, 2, 3].map((i) => (
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

function Interview({ onBackToLanguage }: { onBackToLanguage: () => void }) {
  const { profile, finishOnboarding } = useProfile();
  const context = useIntakeContext();
  const intake = useIntake({ context, mode: 'profile', pushToTalk: true });
  const english = profile.preferredLanguage === 'English';
  useGlow(intake.holding ? 'listen' : intake.status === 'speaking' ? 'speak' : 'idle');

  // The assistant speaks first.
  useEffect(() => {
    void intake.start();
    // Once, on entering the voice step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answers = intake.lines.filter((l) => l.role === 'user' && !l.partial).map((l) => l.text);
  const heard = last(intake.lines, (l) => l.role === 'user' && Boolean(l.partial));
  const said = last(intake.lines, (l) => l.role === 'assistant');
  const question = intake.choices?.question || said?.text || (intake.status === 'connecting' ? '' : '…');
  const step = Math.min(3, 1 + answers.length);

  const done = async () => {
    intake.stop();
    await finishOnboarding();
    router.replace('/');
  };

  return (
    <Screen top={<Header step={intake.ready ? 3 : step} language={profile.preferredLanguage} />} padding={34}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
        {intake.status === 'connecting' && <Text style={type.small}>Connecting…</Text>}
        <Animated.Text key={question} entering={FadeInUp.duration(350)} style={type.question}>
          {question}
        </Animated.Text>
        {!english && intake.choices?.questionEn ? <Text style={type.small}>{intake.choices.questionEn}</Text> : null}
        {heard ? (
          <Animated.View entering={FadeIn} style={s.heard}>
            <Text style={type.callout}>{heard.text}</Text>
          </Animated.View>
        ) : null}
        {intake.choices && !intake.holding && (
          <View style={s.chips}>
            {intake.choices.choices.map((c) => (
              <Chip key={c} title={c} onPress={() => void intake.choose(c)} />
            ))}
          </View>
        )}
        {intake.error ? <Text style={[type.small, { color: color.redText }]}>{intake.error}</Text> : null}
      </View>

      <View style={s.answers}>
        {answers.map((a, i) => (
          <Text key={`${a}-${i}`} style={s.answer}>
            {a}
          </Text>
        ))}
      </View>

      {intake.ready ? (
        <Animated.View entering={FadeInUp.duration(300)}>
          <PillButton title="Start calling" kind="blue" onPress={() => void done()} />
        </Animated.View>
      ) : (
        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 8 }}>
          <HoldToTalk holding={intake.holding} onPressIn={() => void intake.pressTalk()} onRelease={intake.releaseTalk} label="Hold to answer" disabled={intake.status === 'connecting'} />
          <Text style={type.caption}>Hold to answer, or tap one above</Text>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
            <Text style={type.caption} onPress={onBackToLanguage}>
              Change language
            </Text>
            <Text style={type.caption} onPress={() => void done()}>
              Skip for now
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

function last<T>(list: T[], test: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i]!)) return list[i];
  return undefined;
}

const s = StyleSheet.create({
  pillRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22, paddingTop: 6 },
  langPill: { ...type.label, textTransform: 'none', letterSpacing: 0, backgroundColor: color.surface, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5, overflow: 'hidden' },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: 34, paddingTop: 12 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  search: { marginTop: 18, height: 50, borderRadius: 16, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  langRow: { minHeight: 62, borderRadius: 18, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  langRowOn: { borderWidth: 2, borderColor: color.blue },
  heard: { alignSelf: 'flex-start', borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.9)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 16 },
  answer: { ...type.caption, fontSize: 12.5, fontWeight: '500', color: color.blue, backgroundColor: color.blueTint, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
});
