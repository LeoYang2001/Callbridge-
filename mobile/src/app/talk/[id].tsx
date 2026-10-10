import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { requestToDraft } from '@shared/intake';
import type { CallRecord, IntakeDraft } from '@shared/types';
import { useActiveCall } from '@/call/ActiveCall';
import { useGlow } from '@/glow/GlowContext';
import { useIntake } from '@/hooks/useIntake';
import { useIntakeContext } from '@/hooks/useIntakeContext';
import { usePreferences } from '@/hooks/usePreferences';
import { useStartCall } from '@/hooks/useStartCall';
import { getCall } from '@/lib/api';
import { useSignedIn } from '@/lib/session';
import { Review } from '@/talk/Review';
import { color, type } from '@/theme/tokens';
import { Chip } from '@/ui/Button';
import { HoldToTalk, MicState } from '@/ui/HoldToTalk';
import { Icon } from '@/ui/Icon';
import { Screen, TopBar } from '@/ui/Screen';

/**
 * Talk it over: after a call, the assistant tells the user how it went (in their language),
 * answers questions about it, and can set up a follow-up call. Same push-to-talk as setting up
 * a call.
 */
export default function TalkItOver() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conn } = useSignedIn();
  const [call, setCall] = useState<CallRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getCall(conn, id).then(setCall, (e: Error) => setError(e.message));
  }, [conn, id]);
  if (!call) {
    return (
      <Screen>
        <Text style={[type.sub, { marginTop: 40 }]}>{error ?? 'Loading…'}</Text>
      </Screen>
    );
  }
  return <Conversation call={call} draft={requestToDraft(call.request)} />;
}

function Conversation({ call, draft }: { call: CallRecord; draft: IntakeDraft }) {
  const { me } = useSignedIn();
  const prefs = usePreferences();
  const context = useIntakeContext();
  const followUp = useRef({ callId: call.id, draft }).current;
  const intake = useIntake({ context, followUp, pushToTalk: true, keepLines: 40 });
  const { buildRequest, start, submitting, error } = useStartCall();
  const { follow } = useActiveCall();
  const [reviewing, setReviewing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useGlow(reviewing ? 'ready' : intake.holding ? 'listen' : intake.status === 'speaking' ? 'speak' : 'idle');

  // The assistant reports on the call first.
  useEffect(() => {
    void intake.start();
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = () => {
    intake.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (reviewing) {
    return (
      <Screen
        top={
          <TopBar
            left={
              <Text style={[type.small, { color: color.blue, fontWeight: '500' }]} onPress={() => setReviewing(false)}>
                Back
              </Text>
            }
          />
        }
        padding={0}
      >
        <Review
          draft={intake.draft}
          check={intake.check}
          userName={me.profile.name}
          involvement={prefs.involvement}
          onInvolvement={prefs.setInvolvement}
          onCall={async () => {
            const created = await start(buildRequest(intake.draft, context, prefs.involvement));
            if (!created) return;
            intake.stop();
            follow(created.id);
            router.replace({ pathname: '/call/[id]', params: { id: created.id } });
          }}
          onQueue={() => setReviewing(false)}
          busy={submitting}
          error={error}
        />
      </Screen>
    );
  }

  const headline = call.result?.headlineInUserLanguage || call.result?.summaryInUserLanguage || call.failureReason;
  return (
    <Screen
      top={
        <TopBar
          left={
            <Pressable onPress={back} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Icon name="back" size={14} color={color.blue} />
              <Text style={[type.small, { color: color.blue, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>Done</Text>
            </Pressable>
          }
          center={<Text style={[type.bodyStrong, { fontSize: 16 }]}>Talk it over</Text>}
        />
      }
      padding={0}
      bottom={
        <View style={s.composer}>
          <View style={{ width: 58 }} />
          <HoldToTalk holding={intake.holding} onPressIn={() => void intake.pressTalk()} onRelease={intake.releaseTalk} size={72} label="Hold to talk" disabled={intake.status === 'connecting' && !intake.holding} />
          <View style={{ width: 58, alignItems: 'center' }}>
            <MicState on={intake.holding} />
          </View>
        </View>
      }
    >
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <View style={s.summary}>
          <Text style={type.label}>{call.request.counterpartName || call.request.to}</Text>
          {headline ? <Text style={[type.bodyStrong, { lineHeight: 24 }]}>{headline}</Text> : null}
        </View>
        {intake.lines.map((l) => (
          <Animated.View key={l.id} entering={FadeInUp.duration(250)} style={[s.bubble, l.role === 'user' ? s.mine : s.theirs, l.partial && l.role === 'user' && s.partial]}>
            <Text style={[type.callout, { color: l.role === 'user' && !l.partial ? color.white : color.ink, lineHeight: 22 }]}>{l.text}</Text>
          </Animated.View>
        ))}
        {intake.status === 'connecting' ? <Text style={type.caption}>Connecting…</Text> : null}
        {intake.choices && !intake.holding ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {intake.choices.choices.map((c) => (
              <Chip key={c} title={c} onPress={() => void intake.choose(c)} />
            ))}
          </View>
        ) : null}
        {intake.ready ? (
          <Animated.View entering={FadeInUp.duration(300)} style={s.followCard}>
            <Text style={type.label}>Follow-up call</Text>
            <Text style={type.bodyStrong}>{intake.draft.counterpartName || call.request.counterpartName}</Text>
            <Text style={type.small}>Asks only: {intake.draft.taskInUserLanguage || intake.draft.task}</Text>
            <Text style={type.caption}>Extra charges: {intake.draft.maxAdditionalCostUsd ? `up to $${intake.draft.maxAdditionalCostUsd}` : 'ask me first'}</Text>
            <Chip title="Review & call" variant="blue" onPress={() => setReviewing(true)} />
          </Animated.View>
        ) : null}
        {intake.error ? <Text style={[type.small, { color: color.redText }]}>{intake.error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  summary: { backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: 16, gap: 6, marginBottom: 6 },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: color.blue, borderRadius: 20, borderBottomRightRadius: 6 },
  partial: { backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, borderRadius: 20, borderBottomLeftRadius: 6 },
  followCard: { backgroundColor: color.white, borderWidth: 1.5, borderColor: color.blue, borderRadius: 20, padding: 16, gap: 6, marginTop: 6 },
  composer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28, paddingTop: 12, paddingBottom: 4 },
});
