import * as Application from 'expo-application';
import { router } from 'expo-router';
import { versionLabel } from '@/lib/updates';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { nativeLanguageName, searchLanguages } from '@shared/languages';
import { displayPhone } from '@shared/phone';
import { useGlow } from '@/glow/GlowContext';
import { useProfile } from '@/hooks/useProfile';
import { MenuButton } from '@/nav/MenuButton';
import { color, type } from '@/theme/tokens';
import { Avatar } from '@/ui/Avatar';
import { Logo } from '@/ui/Logo';
import { CallerIdRow } from '@/me/CallerId';
import { Chip } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Group, Row, SectionLabel } from '@/ui/Rows';
import { Screen, TopBar } from '@/ui/Screen';

const USUAL = ['English', 'Spanish', 'Japanese', 'Korean', 'Chinese (Mandarin)', 'Vietnamese', 'Tagalog'];

/** Me: your languages, the number calls show, and your account. */
export default function Me() {
  useGlow('none');
  const { me, profile, update, signOut, deleteAccount } = useProfile();
  const [open, setOpen] = useState<'language' | 'usual' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [langQuery, setLangQuery] = useState('');
  const save = async (patch: Record<string, unknown>) => setError(await update(patch));
  const toggle = (k: typeof open) => setOpen(open === k ? null : k);

  return (
    <Screen top={<TopBar right={<MenuButton />} />} padding={22} scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={profile.name || '?'} size={56} />
        <View style={{ gap: 2 }}>
          <Text style={type.h3}>{profile.name || 'You'}</Text>
          <Text style={type.small}>{displayPhone(me.phone)}</Text>
        </View>
      </View>

      <Group>
        <Row label="I speak" value={nativeLanguageName(profile.preferredLanguage)} onPress={() => toggle('language')} />
        {open === 'language' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 14, backgroundColor: color.surface, paddingHorizontal: 14, marginBottom: 10 }}>
              <Icon name="search" size={16} color={color.secondary} />
              <TextInput value={langQuery} onChangeText={setLangQuery} placeholder="Search · 搜索 · Buscar" placeholderTextColor={color.tertiary} style={[type.callout, { flex: 1 }]} autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" />
            </View>
            {searchLanguages(langQuery).length ? (
              <Chips options={searchLanguages(langQuery).map((l) => l.name)} label={(n) => nativeLanguageName(n)} value={profile.preferredLanguage} onPick={(preferredLanguage) => (setLangQuery(''), void save({ preferredLanguage }))} />
            ) : (
              <Text style={[type.small, { marginBottom: 10 }]}>No match. Try the name in English or its own script.</Text>
            )}
          </>
        )}
        <Row label="People I call speak" value={profile.defaultCallLanguage ?? 'English'} onPress={() => toggle('usual')} />
        {open === 'usual' && <Chips options={USUAL.filter((l) => l !== profile.preferredLanguage)} label={(n) => n} value={profile.defaultCallLanguage ?? 'English'} onPick={(defaultCallLanguage) => void save({ defaultCallLanguage })} />}
        <CallerIdRow onChange={(patch: Record<string, unknown>) => void save(patch)} />
      </Group>

      <Group>
        <Row label="Phone book & imports" onPress={() => router.push('/contacts')} last={!__DEV__} />
        {__DEV__ ? <Row label="Glow gallery (dev)" onPress={() => router.push('/dev/glow')} last /> : null}
      </Group>
      {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}

      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <Logo variant="blue" size={20} style={{ opacity: 0.9 }} />
        <Text style={[type.caption, { textAlign: 'center' }]}>CallBridge {versionLabel(Application.nativeApplicationVersion ?? undefined, Application.nativeBuildVersion)}</Text>
      </View>
      <Text style={[type.callout, { textAlign: 'center', fontWeight: '600', marginTop: 8 }]} onPress={() => void signOut()}>
        Sign out
      </Text>
      <Text
        style={[type.small, { textAlign: 'center', color: color.redText }]}
        onPress={() =>
          Alert.alert('Delete your account?', 'Your profile, phone book and call history are deleted. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void deleteAccount() },
          ])
        }
      >
        Delete my account
      </Text>
    </Screen>
  );
}

function Chips({ options, value, onPick, label }: { options: string[]; value: string; onPick: (v: string) => void; label: (v: string) => string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
      {options.map((o) => (
        <Chip key={o} title={label(o)} selected={o === value} onPress={() => onPick(o)} />
      ))}
    </View>
  );
}

