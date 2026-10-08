import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserAnswer } from '@shared/types';
import { answerQuestion } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { color, type } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { clock, useActiveCall, useCallSeconds } from './ActiveCall';

/**
 * The in-app call capsule. iOS hides the app's own Live Activity from the Dynamic Island while
 * the app is open, so CallBridge pins its own black capsule under the status bar (never over
 * the island) on every screen except the call itself. States: connected, on hold (grows into
 * a card with Yes / No / Open), finished (collapses after ~6 s).
 */

const AMBER = '#FFB020';
const ACCENT = '#7BA6FF';
const GREEN = '#4CD97B';

export function CallCapsule() {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { call, live, dismiss } = useActiveCall();
  const seconds = useCallSeconds(call);
  const { state } = useSession();
  const [finishedShown, setFinishedShown] = useState(false);

  const finished = call && !live && call.result;
  useEffect(() => {
    if (!finished) return;
    setFinishedShown(true);
    const t = setTimeout(() => {
      setFinishedShown(false);
      dismiss();
    }, 6000);
    return () => clearTimeout(t);
  }, [finished, dismiss]);

  // A question while the user is elsewhere in the app: tap them on the wrist, so to speak.
  const pendingId = call?.questions?.find((q) => q.status === 'pending')?.id;
  useEffect(() => {
    if (pendingId && !path.startsWith('/call/')) haptic.attention();
  }, [pendingId, path]);

  if (!call || path.startsWith('/call/')) return null;
  if (!live && !finishedShown) return null;
  const open = () => router.navigate({ pathname: '/call/[id]', params: { id: call.id } });
  const name = call.request.counterpartName || call.request.to;
  const question = call.questions?.find((q) => q.status === 'pending');

  const answer = (a: UserAnswer) => {
    if (state.status !== 'signedIn' || !question) return;
    void answerQuestion(state.conn, call.id, question.id, a).catch(() => open());
  };

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(250)} style={[s.wrap, { top: insets.top + 4 }]} pointerEvents="box-none">
      {question ? (
        <Pressable onPress={open} style={s.card}>
          <View style={s.row}>
            <PulseDot />
            <Text style={[type.small, s.white, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
              {name} is on hold
            </Text>
            <Text style={[type.small, { color: AMBER, fontVariant: ['tabular-nums'] }]}>{clock(Math.max(0, Math.round((question.expiresAt - Date.now()) / 1000)))}</Text>
          </View>
          <Text style={[type.callout, s.white]} numberOfLines={2}>
            {question.questionInUserLanguage || question.question}
          </Text>
          <View style={s.row}>
            <CapsuleButton title="Yes" bg={AMBER} fg={color.ink} onPress={() => answer({ decision: 'approve' })} />
            <CapsuleButton title="No" bg="rgba(255,255,255,0.14)" onPress={() => answer({ decision: 'decline' })} />
            <CapsuleButton title="Open" bg="rgba(255,255,255,0.14)" onPress={open} />
          </View>
        </Pressable>
      ) : finished ? (
        <Pressable onPress={open} style={s.pill}>
          <Icon name={call.result?.success ? 'check' : 'alert'} size={16} color={call.result?.success ? GREEN : AMBER} />
          <Text style={[type.small, s.white, { flex: 1 }]} numberOfLines={1}>
            {call.result?.headlineInUserLanguage || `${name}: call ended`}
          </Text>
        </Pressable>
      ) : (
        <Pressable onPress={open} style={s.pill}>
          <Icon name="phone" size={15} color={ACCENT} />
          <Text style={[type.small, s.white, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[type.small, { color: ACCENT, fontVariant: ['tabular-nums'] }]}>{call.status === 'connected' ? clock(seconds) : 'Calling…'}</Text>
          <Icon name="chevron" size={12} color="rgba(255,255,255,0.42)" />
        </Pressable>
      )}
    </Animated.View>
  );
}

function PulseDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: AMBER }, style]} />;
}

function CapsuleButton({ title, bg, fg = color.white, onPress }: { title: string; bg: string; fg?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: bg }, pressed && { opacity: 0.7 }]}>
      <Text style={[type.small, { color: fg, fontWeight: '600' }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 30 },
  pill: { height: 46, borderRadius: 23, backgroundColor: '#000', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 14, alignSelf: 'stretch' },
  card: { borderRadius: 28, backgroundColor: '#000', padding: 16, gap: 10, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  white: { color: color.white },
  btn: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
