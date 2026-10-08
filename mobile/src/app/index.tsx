import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGlow } from '@/glow/GlowContext';
import { useCalls } from '@/hooks/useCalls';
import { useSignedIn } from '@/lib/session';
import { MenuButton } from '@/nav/MenuButton';
import { color, shadow, type } from '@/theme/tokens';
import { Chip } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Screen, TopBar } from '@/ui/Screen';

/**
 * Home (Call): a dim idle aura with the mic off. Hold the big button to talk (push-to-talk
 * arrives with the conversation screens; for now it opens the conversation).
 */
export default function Home() {
  useGlow('idle');
  const { me } = useSignedIn();
  const { calls } = useCalls();
  const name = me.profile.name;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const recent = me.profile.contacts.slice(0, 2).map((c) => `Call ${c.name}`);

  return (
    <Screen top={<TopBar right={<MenuButton />} />} padding={30}>
      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={type.sub}>
          {greeting}
          {name ? `, ${name}` : ''}
        </Text>
        <Text style={type.title}>Who should I call?</Text>
      </View>

      <View style={s.center}>
        <Pressable accessibilityRole="button" accessibilityLabel="Hold to talk" onPress={() => router.push('/intake')} style={({ pressed }) => [s.mic, shadow.mic, pressed && s.micDown]}>
          <Icon name="mic" size={36} color={color.white} />
        </Pressable>
        <Text style={[type.small, { color: color.blue, fontWeight: '600' }]}>Hold to talk</Text>
        <Text style={[type.caption, { textAlign: 'center', marginTop: 10 }]}>The mic stays off until you hold. Or tap a suggestion.</Text>
      </View>

      <View style={s.chips}>
        {[...recent, 'Call the nearest pharmacy'].map((c) => (
          <Chip key={c} variant="suggestion" title={c} onPress={() => router.push('/intake')} />
        ))}
      </View>
      {calls && calls.length === 0 ? null : <View style={{ height: 8 }} />}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  mic: { width: 104, height: 104, borderRadius: 52, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' },
  micDown: { transform: [{ scale: 1.12 }], backgroundColor: color.bluePressed },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 },
});
