import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayPhone } from '@shared/phone';
import type { CallRecord, TranscriptEntry, UserQuestion } from '@shared/types';
import { color, font, type } from '@/theme/tokens';
import { Chip, PillButton, RoundButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { clock } from './ActiveCall';

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
}) {
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
      <View style={s.controls}>
        <Control label={listening ? 'Listening' : 'Listen'} onPress={onListen} active={listening} busy={listenBusy}>
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
export function TranscriptSheet({ lines, them, onClose }: { lines: TranscriptEntry[]; them: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(220)} style={[s.sheet, { top: 110 }]}>
      <View style={s.composerHead}>
        <Text style={type.h3}>Transcript</Text>
        <Pressable onPress={onClose} hitSlop={8} style={s.close}>
          <Icon name="close" size={14} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: insets.bottom + 20 }}>
        {lines.map((t) => {
          if (t.speaker === 'system') {
            return (
              <View key={t.id} style={[s.bubble, s.note]}>
                <Text style={type.caption}>Private · they can't hear this</Text>
                <Text style={type.callout}>{t.text}</Text>
              </View>
            );
          }
          const theirs = t.speaker === 'counterpart';
          return (
            <View key={t.id} style={[s.bubble, theirs ? s.them : s.ai]}>
              <Text style={[type.caption, { color: theirs ? color.secondary : 'rgba(255,255,255,0.75)' }]}>{theirs ? them : 'Assistant'}</Text>
              <Text style={[type.callout, { color: theirs ? color.ink : color.white }]}>{t.translation ?? t.text}</Text>
              {t.translation && t.translation !== t.text ? <Text style={[type.caption, { color: theirs ? color.secondary : 'rgba(255,255,255,0.75)' }]}>{t.text}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
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
  note: { alignSelf: 'flex-end', borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, borderRadius: 18 },
});
