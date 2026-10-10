import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayPhone } from '@shared/phone';
import type { CallRecord, TranscriptEntry, UserQuestion } from '@shared/types';
import { color, font, type } from '@/theme/tokens';
import { Chip, PillButton, RoundButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { clock } from './ActiveCall';
import { haptic } from '@/lib/haptics';
import { loadRecording, type RecordingPlayer } from '@/lib/recording';
import { useSignedIn } from '@/lib/session';

/** Ringing: the number being dialed, the AI disclosure, and Cancel. */
export function Ringing({ call, onCancel }: { call: CallRecord; onCancel: () => void }) {
  const [rings, setRings] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setRings((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const req = call.request;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 34, gap: 8 }}>
        <Text style={[type.label, { color: color.greenText }]}>{call.status === 'preparing' ? 'Getting ready' : `Ringing · ${rings}`}</Text>
        <Text style={type.name}>{req.counterpartName || displayPhone(req.to)}</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 16, color: color.secondary }}>{displayPhone(req.to)}</Text>
        <Text style={[type.small, { marginTop: 18 }]}>The assistant will say it's an AI calling for {req.user.name}, in {req.callLanguage}.</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 10, paddingBottom: 20 }}>
        <RoundButton label="Cancel the call" onPress={onCancel} size={70} bg={color.red} ring={false}>
          <Icon name="phoneDown" size={28} color={color.white} />
        </RoundButton>
        <Text style={type.caption}>Cancel</Text>
      </View>
    </View>
  );
}

/** Live call: the latest line, big, in the user's language with the original underneath. */
export function Live({
  call,
  seconds,
  userName,
  listening,
  listenBusy,
  onListen,
  onEnd,
  onMessage,
  onTranscript,
  onTakeOver,
  onHandBack,
  takeoverBusy,
}: {
  call: CallRecord;
  seconds: number;
  userName: string;
  listening: boolean;
  listenBusy: boolean;
  onListen: () => void;
  onEnd: () => void;
  onMessage: () => void;
  onTranscript: () => void;
  onTakeOver: () => void;
  onHandBack: () => void;
  takeoverBusy: boolean;
}) {
  const takeover = call.takeover;
  const lines = call.transcript.filter((t) => t.speaker !== 'system' && t.text.trim());
  const latest = lines.at(-1);
  const previous = lines.at(-2);
  const turns = Math.min(7, Math.ceil(lines.length / 2));
  return (
    <View style={{ flex: 1 }}>
      <View style={s.segs}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={[s.seg, { backgroundColor: i < turns ? color.green : color.line }]} />
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 30, gap: 10 }}>
        {previous ? (
          <Text style={[type.small, { color: color.tertiary }]} numberOfLines={2}>
            {previous.translation ?? previous.text}
          </Text>
        ) : null}
        {latest ? (
          <Animated.View key={latest.id} entering={FadeInUp.duration(350)} style={{ gap: 10 }}>
            <Text style={[type.label, { color: latest.speaker === 'counterpart' ? color.greenText : color.blue }]}>
              {latest.speaker === 'counterpart' ? 'Them' : `AI for ${userName || 'you'}`}
            </Text>
            <Text style={type.quote}>“{latest.translation ?? latest.text}”</Text>
            {latest.translation && latest.translation !== latest.text ? <Text style={[type.sub, { fontSize: 15 }]}>{latest.text}</Text> : null}
          </Animated.View>
        ) : (
          <Text style={type.sub}>Connected · {clock(seconds)}</Text>
        )}
      </View>
      <View style={s.mode}>
        <Text style={[type.small, { color: color.ink }]}>
          <Text style={{ color: color.green }}>✓ </Text>
          {call.request.involvement === 'handoff' ? 'Handed off' : 'Stay in the loop'}
        </Text>
        <Text style={[type.small, { color: color.ink, fontWeight: '600' }]} onPress={onTranscript}>
          Transcript
        </Text>
      </View>
      <TakeOver state={takeover?.state} onTakeOver={onTakeOver} onHandBack={onHandBack} busy={takeoverBusy} />
      <View style={s.controls}>
        <Control label={listening ? 'Listening' : 'Listen'} onPress={onListen} active={listening} busy={listenBusy} disabled={Boolean(takeover)}>
          <Icon name="headphones" size={22} color={listening ? color.white : color.ink} />
        </Control>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <RoundButton label="End call" onPress={onEnd} size={70} bg={color.red} ring={false}>
            <Icon name="phoneDown" size={28} color={color.white} />
          </RoundButton>
          <Text style={type.caption}>End call</Text>
        </View>
        <Control label="Message" onPress={onMessage} disabled={call.request.involvement === 'handoff'}>
          <Icon name="message" size={22} />
        </Control>
      </View>
    </View>
  );
}

/**
 * Take the call yourself: your phone rings, and you talk with them directly while the assistant
 * listens; hand back when you're done (or just hang up).
 */
function TakeOver({ state, onTakeOver, onHandBack, busy }: { state?: 'ringing' | 'live'; onTakeOver: () => void; onHandBack: () => void; busy: boolean }) {
  if (state === 'live') {
    return (
      <View style={[s.takeover, s.takeoverLive]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.small, { color: color.greenText, fontWeight: '600' }]}>You're on the call</Text>
          <Text style={type.caption}>The assistant is listening. Hang up to hand back.</Text>
        </View>
        <PillButton title="Hand back" kind="green" height={40} onPress={onHandBack} busy={busy} />
      </View>
    );
  }
  if (state === 'ringing') {
    return (
      <View style={s.takeover}>
        <ActivityIndicator size="small" color={color.blue} />
        <Text style={[type.small, { flex: 1, color: color.ink }]}>Calling your phone…</Text>
        <Text style={[type.small, { color: color.blue, fontWeight: '600' }]} onPress={onHandBack} suppressHighlighting>
          Cancel
        </Text>
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => (haptic.commit(), onTakeOver())} disabled={busy} style={({ pressed }) => [s.takeover, pressed && { opacity: 0.7 }]}>
      <Icon name="phone" size={18} color={color.blue} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.small, { color: color.blue, fontWeight: '600' }]}>Take over the call</Text>
        <Text style={type.caption}>Your phone rings, and you talk to them yourself.</Text>
      </View>
      {busy ? <ActivityIndicator size="small" color={color.blue} /> : <Icon name="chevron" size={14} color={color.blue} />}
    </Pressable>
  );
}

function Control({ label, onPress, children, active, busy, disabled }: { label: string; onPress: () => void; children: React.ReactNode; active?: boolean; busy?: boolean; disabled?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, opacity: disabled ? 0.35 : busy ? 0.6 : 1 }}>
      <RoundButton label={label} onPress={disabled ? () => {} : onPress} size={56} bg={active ? color.blue : color.white}>
        {children}
      </RoundButton>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

/** They're on hold for you: the countdown, the question, and the answers. */
export function HoldQuestion({
  q,
  limitUsd,
  remaining,
  english,
  onAnswer,
  busy,
  error,
}: {
  q: UserQuestion;
  limitUsd: number;
  remaining: number;
  english: boolean;
  onAnswer: (decision: 'approve' | 'decline' | 'later') => void;
  busy: boolean;
  error: string | null;
}) {
  const over = q.amountUsd !== undefined && q.amountUsd > limitUsd;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 30, gap: 12 }}>
        <Text style={[type.label, { color: color.amberText }]}>They're on hold for you</Text>
        <Text style={{ fontSize: 64, fontWeight: '200', color: color.amber, fontVariant: ['tabular-nums'] }}>{clock(remaining)}</Text>
        <Text style={[type.h2, { lineHeight: 34 }]}>{q.questionInUserLanguage || q.question}</Text>
        {!english && q.questionInUserLanguage ? <Text style={type.small}>“{q.question}”</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {q.amountUsd !== undefined ? <Text style={s.tag}>${q.amountUsd}</Text> : null}
          {over ? <Text style={s.tag}>Over your limit</Text> : null}
          {q.date ? <Text style={s.tag}>{[q.date, q.startTime].filter(Boolean).join(' ')}</Text> : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: 22, gap: 10 }}>
        {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
        <PillButton title="Approve" kind="amber" height={54} onPress={() => onAnswer('approve')} busy={busy} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PillButton title="Decline" kind="white" height={50} onPress={() => onAnswer('decline')} disabled={busy} style={{ flex: 1 }} />
          <PillButton title="Decide later" kind="white" height={50} onPress={() => onAnswer('later')} disabled={busy} style={{ flex: 1 }} />
        </View>
        <Text style={[type.caption, { textAlign: 'center' }]}>No answer in time? The assistant says you'll follow up.</Text>
      </View>
    </View>
  );
}

const NOTE_CHIPS: Record<string, string[]> = {
  'Chinese (Mandarin)': ['让他们说慢一点', '问问有没有更早的时间', '可以结束了'],
  default: ['Ask them to slow down', 'Ask about an earlier time', 'You can wrap up now'],
};

/** A private note to the assistant mid-call; the other party can't hear it. */
export function Composer({ language, onSend, onClose }: { language: string; onSend: (text: string) => Promise<string | null>; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg) return;
    const err = await onSend(msg);
    setError(err);
    if (!err) setText('');
  };
  return (
    <Animated.View entering={SlideInDown.duration(250)} exiting={SlideOutDown.duration(200)} style={[s.composer, { paddingBottom: insets.bottom + 12 }]}>
      <View style={s.composerHead}>
        <Text style={type.label}>Message the assistant · private</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Icon name="close" size={14} color={color.secondary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(NOTE_CHIPS[language] ?? NOTE_CHIPS.default!).map((c) => (
          <Chip key={c} title={c} variant="suggestion" onPress={() => void send(c)} />
        ))}
      </View>
      <View style={s.input}>
        <TextInput value={text} onChangeText={setText} placeholder="Tell the assistant something" placeholderTextColor={color.tertiary} style={[type.callout, { flex: 1 }]} onSubmitEditing={() => void send(text)} returnKeyType="send" autoFocus />
        <Text style={[type.small, { color: color.blue, fontWeight: '600' }]} onPress={() => void send(text)}>
          Send
        </Text>
      </View>
      {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : <Text style={type.caption}>They can't hear this. The assistant acts on it in its next turn.</Text>}
    </Animated.View>
  );
}

/** The whole conversation so far: them on the left, the assistant on the right, your notes dashed. */
/**
 * The whole conversation, each line in the user's language with what was actually said under it.
 * With a recording, it plays along: the line being heard is highlighted (and scrolled to), and
 * tapping a line plays from there, to hear exactly how it was said.
 */
export function TranscriptSheet({ lines, them, onClose, recording }: { lines: TranscriptEntry[]; them: string; onClose: () => void; recording?: { callId: string; durationMs: number } }) {
  const insets = useSafeAreaInsets();
  const player = useRecording(recording?.callId);
  const scroll = useRef<ScrollView>(null);
  const tops = useRef(new Map<string, number>());
  // The line being heard: the last one that starts at or before the playback position.
  const timed = lines.filter((t) => t.audioMs !== undefined);
  const active = player.started ? [...timed].reverse().find((t) => t.audioMs! <= player.positionMs + 150)?.id : undefined;
  useEffect(() => {
    const y = active ? tops.current.get(active) : undefined;
    if (y !== undefined && player.playing) scroll.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  }, [active, player.playing]);

  return (
    <Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(220)} style={[s.sheet, { top: 110 }]}>
      <View style={s.composerHead}>
        <Text style={type.h3}>Transcript</Text>
        <Pressable onPress={onClose} hitSlop={8} style={s.close}>
          <Icon name="close" size={14} />
        </Pressable>
      </View>
      {recording ? <RecordingBar player={player} durationMs={recording.durationMs} /> : null}
      <ScrollView ref={scroll} contentContainerStyle={{ gap: 10, paddingBottom: insets.bottom + 20 }}>
        {lines.map((t) => {
          const onLayout = (e: { nativeEvent: { layout: { y: number } } }) => tops.current.set(t.id, e.nativeEvent.layout.y);
          if (t.speaker === 'system') {
            return (
              <View key={t.id} onLayout={onLayout} style={[s.bubble, s.note]}>
                <Text style={type.caption}>Private · they can't hear this</Text>
                <Text style={type.callout}>{t.text}</Text>
              </View>
            );
          }
          const theirs = t.speaker === 'counterpart';
          const canPlay = Boolean(recording) && t.audioMs !== undefined;
          return (
            <Pressable
              key={t.id}
              onLayout={onLayout}
              disabled={!canPlay}
              onPress={() => player.play(t.audioMs)}
              accessibilityHint={canPlay ? 'Plays the recording from here' : undefined}
              style={[s.bubble, theirs ? s.them : s.ai, active === t.id && (theirs ? s.themNow : s.aiNow), player.started && active !== t.id && { opacity: 0.55 }]}
            >
              <Text style={[type.caption, { color: theirs ? color.secondary : 'rgba(255,255,255,0.75)' }]}>{theirs ? them : 'Assistant'}</Text>
              <Text style={[type.callout, { color: theirs ? color.ink : color.white }]}>{t.translation ?? t.text}</Text>
              {t.translation && t.translation !== t.text ? <Text style={[type.caption, { color: theirs ? color.secondary : 'rgba(255,255,255,0.75)' }]}>{t.text}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

/** Loads a call's recording and tracks where it's playing. */
function useRecording(callId: string | undefined) {
  const { conn } = useSignedIn();
  const ref = useRef<RecordingPlayer | null>(null);
  const loading = useRef<Promise<RecordingPlayer | null> | null>(null);
  const [state, setState] = useState({ ready: false, busy: false, playing: false, started: false, positionMs: 0, error: null as string | null });

  useEffect(() => () => ref.current?.close(), []);
  // While playing, follow the position (for the bar and the highlighted line).
  useEffect(() => {
    if (!state.playing) return;
    const t = setInterval(() => setState((s) => ({ ...s, positionMs: ref.current?.positionMs() ?? 0 })), 120);
    return () => clearInterval(t);
  }, [state.playing]);

  const load = () => {
    if (!callId) return Promise.resolve(null);
    loading.current ??= loadRecording(conn, callId, () => setState((s) => ({ ...s, playing: false, positionMs: 0, started: false }))).then(
      (p) => (ref.current = p),
      (e: Error) => {
        loading.current = null;
        setState((s) => ({ ...s, busy: false, error: e.message }));
        return null;
      },
    );
    return loading.current;
  };

  return {
    ...state,
    // The first play loads it.
    play: (fromMs?: number) => {
      setState((s) => ({ ...s, busy: !ref.current, error: null }));
      void load().then((p) => {
        if (!p) return;
        p.play(fromMs);
        setState((s) => ({ ...s, ready: true, busy: false, playing: true, started: true, positionMs: p.positionMs() }));
      });
    },
    pause: () => {
      ref.current?.pause();
      setState((s) => ({ ...s, playing: false, positionMs: ref.current?.positionMs() ?? s.positionMs }));
    },
  };
}

type Player = ReturnType<typeof useRecording>;

/** Play / pause, the time, and a bar to tap to jump. */
function RecordingBar({ player, durationMs }: { player: Player; durationMs: number }) {
  const [width, setWidth] = useState(1);
  const at = Math.min(durationMs, player.positionMs);
  return (
    <View style={s.player}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={player.playing ? 'Pause the recording' : 'Play the recording'}
        onPress={() => (haptic.select(), player.playing ? player.pause() : player.play())}
        style={s.playButton}
      >
        {player.busy ? <ActivityIndicator size="small" color={color.white} /> : <Icon name={player.playing ? 'pause' : 'play'} size={16} color={color.white} />}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <Pressable
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onPress={(e) => player.play((e.nativeEvent.locationX / width) * durationMs)}
          hitSlop={{ top: 12, bottom: 12 }}
          style={s.track}
          accessibilityLabel="Recording position"
        >
          <View style={[s.trackFill, { width: `${(at / durationMs) * 100}%` }]} />
        </Pressable>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[type.caption, { fontVariant: ['tabular-nums'] }]}>{clock(Math.floor(at / 1000))}</Text>
          <Text style={[type.caption, { fontVariant: ['tabular-nums'] }]}>{player.error ?? clock(Math.round(durationMs / 1000))}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  segs: { flexDirection: 'row', gap: 4, paddingHorizontal: 34, paddingTop: 8 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
  mode: { marginHorizontal: 22, marginBottom: 14, height: 46, borderRadius: 23, backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingBottom: 8 },
  tag: { ...type.caption, color: color.amberText, backgroundColor: color.amberTint, fontWeight: '600', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, gap: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20 },
  composerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 16, backgroundColor: color.surface, paddingHorizontal: 16 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  them: { alignSelf: 'flex-start', backgroundColor: color.surface, borderRadius: 20, borderBottomLeftRadius: 6 },
  ai: { alignSelf: 'flex-end', backgroundColor: color.blue, borderRadius: 20, borderBottomRightRadius: 6 },
  takeover: { marginHorizontal: 22, marginBottom: 14, minHeight: 58, borderRadius: 20, backgroundColor: color.blueTint, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  takeoverLive: { backgroundColor: color.greenTint },
  themNow: { borderWidth: 2, borderColor: color.blue },
  aiNow: { borderWidth: 2, borderColor: color.ink },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.surface, borderRadius: 20, padding: 12 },
  playButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: color.line, overflow: 'hidden' },
  trackFill: { height: 6, backgroundColor: color.blue },
  note: { alignSelf: 'flex-end', borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, borderRadius: 18 },
});
