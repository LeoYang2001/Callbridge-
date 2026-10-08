import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { APP_LANGUAGES, nativeLanguageName } from '@shared/languages';
import { displayPhone } from '@shared/phone';
import { useGlow } from '@/glow/GlowContext';
import { usePreferences } from '@/hooks/usePreferences';
import { useProfile } from '@/hooks/useProfile';
import { MenuButton } from '@/nav/MenuButton';
import { color, type } from '@/theme/tokens';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Button';
import { Group, Row, SectionLabel } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Toggle } from '@/ui/Toggle';
import { Screen, TopBar } from '@/ui/Screen';

const CHARGES = [0, 25, 50, 100];
const HOLDS = [15, 30, 45, 60, 90];

/** Me: who you are to the assistant, how calls run by default, and what it may share. */
export default function Me() {
  useGlow('none');
  const { me, profile, update, signOut, deleteAccount } = useProfile();
  const prefs = usePreferences();
  const [open, setOpen] = useState<'language' | 'voice' | 'charges' | 'hold' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: Record<string, unknown>) => setError(await update(patch));
  const voice = prefs.voice ?? profile.voice ?? 'marin';
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
          <Chips options={APP_LANGUAGES.map((l) => l.name)} label={(n) => nativeLanguageName(n)} value={profile.preferredLanguage} onPick={(preferredLanguage) => void save({ preferredLanguage })} />
        )}
        <Row label="Assistant voice" value={cap(voice)} onPress={() => toggle('voice')} />
        {open === 'voice' && (
          <Chips
            options={['marin', 'cedar']}
            label={cap}
            value={voice}
            onPick={(v) => {
              prefs.setVoice(v as 'marin' | 'cedar');
              void save({ voice: v });
            }}
          />
        )}
        <Row label="Default call mode" right={<View style={{ width: 200 }}><Segmented options={[{ value: 'supervised', label: 'In the loop' }, { value: 'handoff', label: 'Hand off' }]} value={prefs.involvement} onChange={prefs.setInvolvement} /></View>} />
        <Row label="Extra charges" value={profile.maxChargeUsd ? `Up to $${profile.maxChargeUsd}` : 'Ask me first'} onPress={() => toggle('charges')} />
        {open === 'charges' && <Chips options={CHARGES.map(String)} label={(n) => (n === '0' ? 'Ask me first' : `Up to $${n}`)} value={String(profile.maxChargeUsd ?? 0)} onPick={(n) => void save({ maxChargeUsd: Number(n) })} />}
        <Row label="Hold for my answer" sub="How long the other party waits while you decide" value={`${profile.holdSeconds ?? 30} s`} onPress={() => toggle('hold')} last={open !== 'hold'} />
        {open === 'hold' && <Chips options={HOLDS.map(String)} label={(n) => `${n} s`} value={String(profile.holdSeconds ?? 30)} onPick={(n) => void save({ holdSeconds: Number(n) })} />}
      </Group>

      <SectionLabel>The assistant may share</SectionLabel>
      <Group>
        {profile.shareable.length === 0 ? <Row label="Nothing yet" sub="Tell the assistant what it may share, like your date of birth or insurance provider." last /> : null}
        {profile.shareable.map((f, i) => (
          <Row
            key={f.label}
            label={f.label}
            sub={f.value}
            last={i === profile.shareable.length - 1}
            right={<Toggle label={`Share ${f.label}`} value={!f.off} onChange={(on) => void save({ shareable: profile.shareable.map((x, j) => (j === i ? { ...x, off: !on } : x)) })} />}
          />
        ))}
      </Group>
      <Text style={[type.caption, { marginHorizontal: 4 }]}>Card numbers, SSN, passwords and account numbers are never shared.</Text>

      <Group>
        <Row label="Notifications" onPress={() => router.push('/notifications')} />
        <Row label="Phone book & imports" onPress={() => router.push('/contacts')} />
        <Row label="Errands" onPress={() => router.push('/errands')} />
        <Row label="Update my profile by talking" onPress={() => router.push({ pathname: '/intake', params: { mode: 'profile' } })} last={!__DEV__} />
        {__DEV__ ? <Row label="Glow gallery (dev)" onPress={() => router.push('/dev/glow')} last /> : null}
      </Group>
      {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}

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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
