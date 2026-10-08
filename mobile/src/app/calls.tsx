import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import type { CallSummary } from '@shared/types';
import { useGlow } from '@/glow/GlowContext';
import { useCalls } from '@/hooks/useCalls';
import { MenuButton } from '@/nav/MenuButton';
import { summaryTag } from '@/call/outcome';
import { color, type } from '@/theme/tokens';
import { StatusPill } from '@/ui/Text';
import { Screen, TopBar } from '@/ui/Screen';

/** Call history (Upcoming cards arrive with the library phase). */
export default function Calls() {
  useGlow('none');
  const { calls, refreshing, refresh } = useCalls();
  return (
    <Screen top={<TopBar right={<MenuButton />} />} padding={0}>
      <FlatList
        data={calls ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={<Text style={[type.title, { marginBottom: 16 }]}>Calls</Text>}
        ListEmptyComponent={calls ? <Text style={type.sub}>No calls yet.</Text> : null}
        renderItem={({ item }) => <Row c={item} />}
      />
    </Screen>
  );
}


function Row({ c }: { c: CallSummary }) {
  const d = new Date(c.createdAt);
  const today = new Date().toDateString() === d.toDateString();
  return (
    <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.line}>
          <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>
            {c.counterpartName || displayPhone(c.to)}
          </Text>
          <Text style={type.caption}>{today ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
        </View>
        {c.headline ? (
          <Text style={type.small} numberOfLines={1}>
            {c.headline}
          </Text>
        ) : null}
        <StatusPill name={summaryTag(c)} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.divider },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
});
