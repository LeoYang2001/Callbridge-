import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import type { UserAnswer } from '@shared/types';
import { useActiveCall, useCallSeconds, clock } from '@/call/ActiveCall';
import { Composer, HoldQuestion, Live, Ringing, TranscriptSheet } from '@/call/LiveViews';
import { outcomeOf } from '@/call/outcome';
import { Result } from '@/call/Result';
import { useGlow } from '@/glow/GlowContext';
import type { GlowMode } from '@/glow/modes';
import { useCall, useListen } from '@/hooks/useCall';
import { usePreferences } from '@/hooks/usePreferences';
import { useStartCall } from '@/hooks/useStartCall';
import { haptic } from '@/lib/haptics';
import { useSignedIn } from '@/lib/session';
import { color, type } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Screen, TopBar } from '@/ui/Screen';

/**
 * One call, from ringing to the result: ringing → live (latest line, listen, message, end) →
 * on hold for you (the edge is the countdown) → wrapping up → result. Notifications and the
 * capsule open this screen.
 */
export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSignedIn();
  const c = useCall(id);
  const listen = useListen(id);
  const { follow } = useActiveCall();
  const { start, submitting } = useStartCall();
  const seconds = useCallSeconds(c.call);
  const [composer, setComposer] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  // The capsule and the menu follow a live call opened from anywhere.
  useEffect(() => {
    if (c.live) follow(id);
  }, [c.live, id, follow]);

  const call = c.call;
  const q = c.pending[0];
  // The hold countdown ticks every second.
  useEffect(() => {
    if (!q) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [q]);
  const total = q ? Math.max(1, (q.expiresAt - q.askedAt) / 1000) : 1;
  const remaining = q ? Math.max(0, Math.round((q.expiresAt - Date.now()) / 1000)) : 0;

  const phase = !call
    ? 'loading'
    : call.status === 'preparing' || call.status === 'dialing'
      ? 'ringing'
      : call.status === 'connected'
        ? q && call.request.involvement !== 'handoff'
          ? 'hold'
          : 'live'
        : call.status === 'analyzing'
          ? 'wrapping'
          : 'result';

  // Hear the call as soon as it connects (a setting in Me), unless the user stopped it here.
  const prefs = usePreferences();
  const autoListened = useRef(false);
  useEffect(() => {
    if (!prefs.listenLive || autoListened.current || listen.active) return;
    if (phase === 'live' || phase === 'hold') {
      autoListened.current = true;
      void listen.toggle();
    }
  }, [phase, prefs.listenLive, listen]);

  // Feel the moments that matter: connected, someone holding for you, how it ended.
  const lastPhase = useRef(phase);
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (was === phase || was === 'loading' || !call) return;
    if (phase === 'live' && was === 'ringing') haptic.connected();
    else if (phase === 'hold') haptic.attention();
    else if (phase === 'result') (outcomeOf(call).good ? haptic.success : haptic.failure)();
  }, [phase, call]);

  const glow: GlowMode =
    phase === 'ringing' ? 'ring' : phase === 'hold' ? 'hold' : phase === 'live' || phase === 'wrapping' ? (composer ? 'msg' : 'hair') : phase === 'result' && call ? (outcomeOf(call).good ? 'done' : 'fail') : 'none';
  useGlow(glow, phase === 'hold' ? remaining / total : 1);

  if (!call) {
    return (
      <Screen>
        <Text style={[type.sub, { marginTop: 40 }]}>{c.error ?? 'Loading…'}</Text>
      </Screen>
    );
  }

  const them = call.request.counterpartName || displayPhone(call.request.to);
  const english = me.profile.preferredLanguage === 'English';
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const answer = async (decision: UserAnswer['decision']) => {
    if (!q) return;
    setAnswering(true);
    setError(await c.answer(q.id, { decision }));
    setAnswering(false);
  };

  const header = (
    <TopBar
      left={
        <Pressable onPress={leave} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon name="back" size={14} color={color.blue} />
          <Text style={[type.small, { color: color.blue, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>{phase === 'result' ? 'Home' : 'Leave'}</Text>
        </Pressable>
      }
      center={
        phase === 'ringing' || phase === 'result' ? null : (
          <View style={{ alignItems: 'center' }}>
            <Text style={[type.bodyStrong, { fontSize: 16 }]} numberOfLines={1}>
              {them}
            </Text>
            <Text style={[type.caption, { color: phase === 'hold' ? color.amberText : color.greenText }]}>
              {phase === 'hold' ? 'On hold · waiting on you' : phase === 'wrapping' ? 'Wrapping up…' : `In progress · ${clock(seconds)}`}
            </Text>
          </View>
        )
      }
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen top={header} padding={0}>
        {phase === 'ringing' && <Ringing call={call} onCancel={() => void c.hangUp()} />}
        {(phase === 'live' || phase === 'wrapping') && (
          <Live
            call={call}
            seconds={seconds}
            userName={me.profile.name}
            listening={listen.listening}
            listenBusy={listen.starting}
            onListen={() => void listen.toggle()}
            onEnd={() => void c.hangUp()}
            onMessage={() => setComposer(true)}
            onTranscript={() => setTranscript(true)}
          />
        )}
        {phase === 'hold' && q && (
          <HoldQuestion q={q} limitUsd={call.request.constraints.maxAdditionalCostUsd} remaining={remaining} english={english} onAnswer={(d) => void answer(d)} busy={answering} error={error} />
        )}
        {phase === 'result' && (
          <Result
            call={call}
            english={english}
            onDone={() => router.replace('/')}
            onTryAgain={async () => {
              const again = await start(call.request);
              if (again) router.replace({ pathname: '/call/[id]', params: { id: again.id } });
            }}
            retrying={submitting}
            onTalk={() => router.push({ pathname: '/talk/[id]', params: { id: call.id } })}
            onTranscript={() => setTranscript(true)}
          />
        )}
        {listen.note && phase !== 'result' ? <Text style={[type.caption, { textAlign: 'center', paddingBottom: 6 }]}>{listen.note}</Text> : null}
      </Screen>
      {composer && phase !== 'result' && <Composer language={me.profile.preferredLanguage} onSend={c.message} onClose={() => setComposer(false)} />}
      {transcript && <TranscriptSheet lines={call.transcript} them={them} onClose={() => setTranscript(false)} />}
    </View>
  );
}
