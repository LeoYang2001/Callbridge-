import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useGlow } from '@/glow/GlowContext';
import { useProfile } from '@/hooks/useProfile';
import { color, type } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Group, Row } from '@/ui/Rows';
import { Toggle } from '@/ui/Toggle';
import { Screen, TopBar } from '@/ui/Screen';

const SETTINGS = [
  { key: 'results', label: 'Call results', sub: 'When a call finishes' },
  { key: 'reminders', label: 'Upcoming reminders', sub: 'The evening before appointments' },
  { key: 'liveActivity', label: 'Live Activity', sub: 'Calls on the lock screen and Dynamic Island' },
] as const;

/** Which notifications to get. Hold questions always notify: someone is waiting on the line. */
export default function Notifications() {
  useGlow('none');
  const { profile, update } = useProfile();
  const notify = profile.notify ?? {};
  return (
    <Screen
      top={
        <TopBar
          left={
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Icon name="back" size={14} color={color.blue} />
              <Text style={[type.small, { color: color.blue, fontWeight: '500' }]}>Me</Text>
            </Pressable>
          }
          center={<Text style={[type.bodyStrong, { fontSize: 16 }]}>Notifications</Text>}
        />
      }
      padding={22}
      scroll
    >
      <Group>
        <Row
          label="Hold questions"
          sub="Needed during calls, so always on"
          right={
            <View style={{ backgroundColor: color.amberTint, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={[type.caption, { color: color.amberText, fontWeight: '600' }]}>Always on</Text>
            </View>
          }
        />
        {SETTINGS.map((s, i) => (
          <Row
            key={s.key}
            label={s.label}
            sub={s.sub}
            last={i === SETTINGS.length - 1}
            right={<Toggle label={s.label} value={notify[s.key] !== false} onChange={(on) => void update({ notify: { ...notify, [s.key]: on } })} />}
          />
        ))}
      </Group>
    </Screen>
  );
}
