import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { Icon } from '@/ui/Icon';
import { displayPhone } from '@shared/phone';
import type { TranslatedCallSummary } from '@shared/types';
import { useGlow } from '@/glow/GlowContext';
import { useCalls } from '@/hooks/useCalls';
import { EDGE_WIDTH } from '@/nav/EdgeSwipe';
import { MenuButton } from '@/nav/MenuButton';
import { color, type } from '@/theme/tokens';
import { Pill } from '@/ui/Text';
import { Screen, ScreenTitle, TopBar } from '@/ui/Screen';

/** Calls: your translated calls, newest first; tap one to read its captions again. */
export default function Calls() {
  useGlow('none');
  const { calls, refreshing, refresh, remove, error } = useCalls();

  return (
    <Screen
      top={
        <>
          <TopBar right={<MenuButton />} />
          <ScreenTitle title="Calls" />
        </>
      }
      padding={0}
    >
      <FlatList
        data={calls ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={calls ? <Text style={[type.sub, { paddingHorizontal: 22 }]}>No calls yet.</Text> : null}
        ListFooterComponent={error ? <Text style={[type.small, { color: color.redText, paddingHorizontal: 22, paddingTop: 12 }]}>{error}</Text> : null}
        renderItem={({ item }) => <SwipeToDelete onDelete={() => void remove(item.id)} label={item.contactName || displayPhone(item.to)}><Row c={item} /></SwipeToDelete>}
      />
    </Screen>
  );
}

/**
 * Swipe a call left to reveal Delete; a long swipe deletes it straight away. A swipe that starts
 * at the right edge is the menu's, so the row doesn't take touches there.
 */
function SwipeToDelete({ children, onDelete, label }: { children: React.ReactNode; onDelete: () => void; label: string }) {
  const del = () => {
    haptic.commit();
    onDelete();
  };
  return (
    <Animated.View exiting={FadeOut.duration(200)} layout={LinearTransition.duration(220)}>
      <ReanimatedSwipeable
        hitSlop={{ right: -EDGE_WIDTH }}
        friction={1.6}
        rightThreshold={60}
        overshootRight={false}
        onSwipeableWillOpen={(direction) => direction === 'left' && haptic.select()}
        renderRightActions={() => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete call with ${label}`} onPress={del} style={s.delete}>
            <Icon name="trash" size={18} color={color.white} />
            <Text style={[type.caption, { color: color.white, fontWeight: '600' }]}>Delete</Text>
          </Pressable>
        )}
      >
        <View style={{ backgroundColor: color.white }}>{children}</View>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

function Row({ c }: { c: TranslatedCallSummary }) {
  const d = new Date(c.createdAt);
  const today = new Date().toDateString() === d.toDateString();
  const length = c.durationSeconds ? `${Math.floor(c.durationSeconds / 60)}:${String(c.durationSeconds % 60).padStart(2, '0')}` : null;
  return (
    <Pressable onPress={() => router.push({ pathname: '/translate/[id]', params: { id: c.id } })} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.line}>
          <Text style={[type.bodyStrong, { fontSize: 16, flex: 1 }]} numberOfLines={1}>
            {c.contactName || displayPhone(c.to)}
          </Text>
          <Text style={type.caption}>{today ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
        </View>
        {c.preview ? (
          <Text style={[type.small, { color: color.body }]} numberOfLines={1}>
            {c.preview}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pill bg={c.status === 'failed' ? color.redTint : color.tealTint} fg={c.status === 'failed' ? color.redText : color.teal}>
            {c.status === 'failed' ? 'Didn’t connect' : length ? `${c.theirLanguage} · ${length}` : c.theirLanguage}
          </Pill>
          {c.interpreterUsed ? <Pill bg={color.blueTint} fg={color.blue}>Interpreter</Pill> : null}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { marginHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.divider },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  delete: { width: 92, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
