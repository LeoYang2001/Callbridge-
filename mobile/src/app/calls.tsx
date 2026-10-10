import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { Icon } from '@/ui/Icon';
import { displayPhone } from '@shared/phone';
import type { CallSummary, UpcomingAppointment } from '@shared/types';
import { summaryTag } from '@/call/outcome';
import { useGlow } from '@/glow/GlowContext';
import { useCalls } from '@/hooks/useCalls';
import { useSignedIn } from '@/lib/session';
import { EDGE_WIDTH } from '@/nav/EdgeSwipe';
import { MenuButton } from '@/nav/MenuButton';
import { color, type } from '@/theme/tokens';
import { StatusPill } from '@/ui/Text';
import { Screen, ScreenTitle, TopBar } from '@/ui/Screen';

/** Calls: what's coming up (booked by calls) and recent calls with how each went. */
export default function Calls() {
  useGlow('none');
  const { me } = useSignedIn();
  const { calls, refreshing, refresh, remove, error } = useCalls();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = me.profile.appointments.filter((a) => a.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

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
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            {upcoming.length ? (
              <>
                <Text style={[type.label, { paddingHorizontal: 22 }]}>Upcoming</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 22 }}>
                  {upcoming.map((a) => (
                    <UpcomingCard key={a.id} a={a} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Text style={[type.label, { paddingHorizontal: 22, marginTop: 6 }]}>Recent</Text>
          </View>
        }
        ListEmptyComponent={calls ? <Text style={[type.sub, { paddingHorizontal: 22 }]}>No calls yet.</Text> : null}
        ListFooterComponent={error ? <Text style={[type.small, { color: color.redText, paddingHorizontal: 22, paddingTop: 12 }]}>{error}</Text> : null}
        renderItem={({ item }) => <SwipeToDelete onDelete={() => void remove(item.id)} label={item.counterpartName || displayPhone(item.to)}><Row c={item} /></SwipeToDelete>}
      />
    </Screen>
  );
}

function UpcomingCard({ a }: { a: UpcomingAppointment }) {
  const d = new Date(`${a.date}T12:00:00`);
  const [h = 0, m = 0] = a.time.split(':').map(Number);
  const time = new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id: a.callId } })} style={s.upcoming}>
      <Text style={[type.label, { color: color.redText, fontSize: 11 }]}>{d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
      <Text style={[type.bodyStrong, { fontSize: 16 }]}>{time}</Text>
      <Text style={[type.callout, { fontSize: 15 }]} numberOfLines={1}>
        {a.with}
      </Text>
      <Text style={type.caption} numberOfLines={2}>
        {a.needsConfirmation ? 'Needs confirming · ' : ''}
        {a.description}
      </Text>
    </Pressable>
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

function Row({ c }: { c: CallSummary }) {
  const d = new Date(c.createdAt);
  const today = new Date().toDateString() === d.toDateString();
  return (
    <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.line}>
          <Text style={[type.bodyStrong, { fontSize: 16, flex: 1 }]} numberOfLines={1}>
            {c.counterpartName || displayPhone(c.to)}
          </Text>
          <Text style={type.caption}>{today ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
        </View>
        {c.headline ? (
          <Text style={[type.small, { color: color.body }]} numberOfLines={1}>
            {c.headline}
          </Text>
        ) : null}
        <StatusPill name={summaryTag(c)} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  upcoming: { width: 200, backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: 14, gap: 4 },
  row: { marginHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.divider },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  delete: { width: 92, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
