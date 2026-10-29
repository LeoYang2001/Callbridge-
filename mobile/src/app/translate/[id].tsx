import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { languageCode } from '@shared/languages';
import { displayPhone } from '@shared/phone';
import type { CaptionLine, TranslatedCallRecord } from '@shared/types';
import { useGlow } from '@/glow/GlowContext';
import { askConsent, getTranslatedCall, hangUpTranslatedCall, setCaptions, setInterpreter, startTranslatedCall } from '@/lib/api';
import { connectFromApp, inAppJoinActive, leaveAppJoin, muteAppJoin } from '@/lib/appJoin';
import { haptic } from '@/lib/haptics';
import { setLiveCall } from '@/lib/liveCall';
import { useSignedIn } from '@/lib/session';
import { color, type } from '@/theme/tokens';
import { PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Avatar } from '@/ui/Identity';
import { Screen } from '@/ui/Screen';

/**
 * A translated call in progress: connecting (dark), then the caption conversation, the
 * interpreter controls and End; afterwards the captions and Call again. Indigo is the user,
 * teal the person they're calling.
 */

/** What to ask before adding the interpreter, by language code. */
const ASK: Record<string, string> = {
  en: 'Is it OK if an AI interpreter joins to translate for us?',
  es: '¿Le parece bien si se une un intérprete de IA para traducir?',
  ja: 'AI通訳に入ってもらって通訳してもらってもいいですか？',
  ko: 'AI 통역사가 들어와서 통역해도 괜찮을까요?',
  zh: '可以让 AI 翻译加入，帮我们翻译吗？',
  vi: 'Có phiền không nếu một phiên dịch viên AI tham gia để dịch giúp chúng ta?',
  ru: 'Вы не против, если к разговору подключится ИИ-переводчик?',
  hi: 'क्या एक AI दुभाषिया अनुवाद के लिए जुड़ सकता है?',
  fr: 'Est-ce que je peux ajouter un interprète IA pour traduire ?',
  pt: 'Tudo bem se um intérprete de IA entrar para traduzir?',
};
const SHORT: Record<string, string> = { en: 'EN', zh: '中文', ja: '日本語', ko: '한국어', es: 'ES', vi: 'VI', tl: 'TL', ru: 'RU', ar: 'AR', hi: 'HI', fr: 'FR', de: 'DE', pt: 'PT', it: 'IT' };
const short = (l: string) => SHORT[languageCode(l) ?? ''] ?? l.slice(0, 3).toUpperCase();

export default function TranslatedCall() {
  const { id, inApp } = useLocalSearchParams<{ id: string; inApp?: string }>();
  const { conn } = useSignedIn();
  const [call, setCall] = useState<TranslatedCallRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scroll = useRef<ScrollView>(null);
  const over = call?.status === 'ended' || call?.status === 'failed';
  useGlow(over ? 'none' : call?.status === 'live' ? (call.interpreter === 'on' ? 'speak' : 'ring') : 'ring');

  // Poll while the call runs; again the moment the app comes back to the front.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      try {
        const r = await getTranslatedCall(conn, id);
        if (stopped) return;
        setCall(r);
        setError(null);
        if (r.status === 'ended' || r.status === 'failed') {
          setLiveCall(null);
          if (inAppJoinActive()) void leaveAppJoin();
          return;
        }
        setLiveCall({ id: r.id, name: r.request.contactName || displayPhone(r.request.to), answeredAt: r.answeredAt });
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(tick, 600);
    };
    void tick();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void tick());
    return () => {
      stopped = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [conn, id]);

  useEffect(() => {
    if (over) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [over]);
  useEffect(() => {
    if (call && call.interpreter !== 'off') setAsking(false);
  }, [call?.interpreter]);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const hangUp = () =>
    act('end', async () => {
      haptic.commit();
      await hangUpTranslatedCall(conn, id);
      if (inAppJoinActive()) await leaveAppJoin();
    });

  if (!call) {
    return (
      <View style={[s.night, { alignItems: 'center', justifyContent: 'center' }]}>
        {error ? <Text style={[type.body, { color: color.white, padding: 24, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={color.white} />}
      </View>
    );
  }

  const who = call.request.contactName || displayPhone(call.request.to);
  const seconds = call.answeredAt ? Math.floor(((call.endedAt ?? now) - call.answeredAt) / 1000) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  if (call.status === 'connecting_you' || call.status === 'dialing') {
    return <Connecting call={call} who={who} inApp={Boolean(inApp)} error={error} busy={busy !== null} onEnd={() => void hangUp()} />;
  }

  const captionList = (
    <>
      {call.lines.length === 0 && !over ? <Text style={[type.sub, { textAlign: 'center', marginTop: 24 }]}>{call.captions ? 'Captions appear here as you talk.' : 'Captions are off.'}</Text> : null}
      {call.lines.map((l) => (
        <Bubble key={l.id} line={l} who={who} done={over} />
      ))}
    </>
  );

  if (over) {
    return (
      <Screen padding={0} bottom={
        <View style={s.barRow}>
          <PillButton title="Done" kind="white" onPress={() => router.replace('/')} style={{ flex: 0, paddingHorizontal: 24 }} />
          <PillButton
            title="Call again"
            kind="green"
            busy={busy === 'again'}
            onPress={() =>
              void act('again', async () => {
                const { record } = await startTranslatedCall(conn, { ...call.request, join: 'phone' });
                router.replace({ pathname: '/translate/[id]', params: { id: record.id } });
              })
            }
            style={{ flex: 1 }}
          />
        </View>
      }>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          <Text style={type.label}>{call.status === 'failed' ? 'Call didn’t connect' : `Call ended · ${clock}`}</Text>
          <Text style={[type.title, { fontWeight: '800' }]}>{who}</Text>
          {call.status === 'failed' && call.failureReason ? <Text style={type.body}>{call.failureReason}</Text> : null}
          {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
          {captionList}
        </ScrollView>
      </Screen>
    );
  }

  const theirCode = languageCode(call.request.theirLanguage) ?? 'en';
  const yourCode = languageCode(call.userLanguage) ?? 'en';
  const live = call.status === 'live';

  return (
    <Screen
      padding={0}
      top={
        <View style={s.head}>
          <Avatar name={who} on size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[type.row, { fontWeight: '800' }]} numberOfLines={1}>
              {who}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={s.dot} />
              <Text style={type.caption}>
                {clock}
                {call.captions ? ' · Captions on' : ''}
              </Text>
            </View>
          </View>
          <Text style={s.pair}>
            {short(call.request.theirLanguage)} ⇄ {short(call.userLanguage)}
          </Text>
        </View>
      }
      bottom={
        <View style={s.controls}>
          <View style={s.barRow}>
            <ControlButton title="Captions" on={call.captions} disabled={busy !== null || !live} onPress={() => void act('captions', () => setCaptions(conn, id, !call.captions))} />
            {inAppJoinActive() ? (
              <ControlButton
                title={muted ? 'Unmute' : 'Mute'}
                on={muted}
                onPress={() => {
                  const next = !muted;
                  setMuted(next);
                  void muteAppJoin(next);
                }}
              />
            ) : null}
            {call.interpreter === 'off' ? (
              <PillButton title="Add interpreter" kind="blue" height={52} disabled={busy !== null || !live} onPress={() => setAsking(true)} style={{ flex: 1 }} />
            ) : (
              <PillButton title="Remove interpreter" kind="white" height={52} disabled={busy !== null || call.interpreter === 'joining'} onPress={() => void act('remove', () => setInterpreter(conn, id, false))} style={{ flex: 1 }} />
            )}
          </View>
          <PillButton title="End call" kind="red" height={52} disabled={busy === 'end'} onPress={() => void hangUp()} />
        </View>
      }
    >
      {call.interpreter !== 'off' ? (
        <View style={s.banner} accessibilityRole="summary">
          <Icon name="speaker" size={20} color="#7fd8c6" />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: color.white }]}>{call.interpreter === 'joining' ? 'Interpreter joining…' : 'Interpreter on'}</Text>
            <Text style={[type.caption, { color: '#b7c0d1' }]}>{call.interpreter === 'joining' ? 'Telling both sides it’s an AI' : 'Speaking for both of you'}</Text>
          </View>
        </View>
      ) : null}
      {call.notice ? <Text style={[type.small, s.notice]}>{call.notice}</Text> : null}
      {error ? <Text style={[type.small, { color: color.redText, paddingHorizontal: 20 }]}>{error}</Text> : null}
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {call.interpreter === 'on' ? <Text style={s.sysChip}>Interpreter joined · both sides were told</Text> : null}
        {captionList}
      </ScrollView>

      <AskSheet
        visible={asking}
        theirLanguage={call.request.theirLanguage}
        phrase={ASK[theirCode] ?? ASK.en!}
        yours={yourCode !== theirCode ? ASK[yourCode] : undefined}
        busy={busy}
        onClose={() => setAsking(false)}
        onAsk={() => void act('ask', () => askConsent(conn, id))}
        onAgreed={() => void act('add', () => setInterpreter(conn, id, true)).then((ok) => ok && setAsking(false))}
      />
    </Screen>
  );
}

function Connecting({ call, who, inApp, error, busy, onEnd }: { call: TranslatedCallRecord; who: string; inApp: boolean; error: string | null; busy: boolean; onEnd: () => void }) {
  const insets = useSafeAreaInsets();
  const you = call.status === 'dialing';
  return (
    <View style={[s.night, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}>
      <View style={s.rings}>
        <View style={s.ringInner}>
          <Avatar name={who} on size={108} />
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={[type.h2, { color: color.white, fontWeight: '800' }]}>{who}</Text>
        <Text style={[type.callout, { color: '#b7c0d1' }]}>{you ? 'Calling…' : inApp ? 'Connecting…' : 'Answer your phone'}</Text>
      </View>
      <View style={s.nightCard}>
        <Step state={you ? 'done' : 'now'} title={you ? "You're connected" : inApp ? 'Connecting you' : 'Your phone is ringing'} sub={you ? 'You’re on the line' : inApp ? 'Through this app' : 'Pick up to start the call'} />
        <Step state={you ? 'now' : 'next'} title={`Ringing ${who}`} sub={`They speak ${call.request.theirLanguage}`} />
      </View>
      <View style={[s.nightCard, { padding: 16, gap: 6 }]}>
        <Text style={[type.label, { color: '#7fd8c6' }]}>When they answer</Text>
        <Text style={[type.callout, { color: '#e4e8f0', lineHeight: 22 }]}>Say hello in your own words. Captions show what they say in {call.userLanguage}.</Text>
      </View>
      {error ? <Text style={[type.small, { color: '#ff9b92', textAlign: 'center' }]}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="End call" disabled={busy} onPress={onEnd} style={s.endRound}>
        <Icon name="phoneDown" size={28} color={color.white} />
      </Pressable>
    </View>
  );
}

function Step({ state, title, sub }: { state: 'done' | 'now' | 'next'; title: string; sub: string }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 12 }, state === 'next' && { opacity: 0.6 }]}>
      <View style={[s.stepDot, state === 'done' && { backgroundColor: color.green, borderColor: color.green }, state === 'now' && { borderColor: '#7fa3ff' }]}>
        {state === 'now' ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7fa3ff' }} /> : null}
      </View>
      <View>
        <Text style={[type.bodyStrong, { color: color.white, fontSize: 15 }]}>{title}</Text>
        <Text style={[type.caption, { color: '#b7c0d1' }]}>{sub}</Text>
      </View>
    </View>
  );
}

function Bubble({ line, who, done }: { line: CaptionLine; who: string; done: boolean }) {
  const you = line.speaker === 'you';
  const speaking = !line.final && !done;
  // Their words in the user's language first; the user's own words with the translation.
  const main = you ? line.original : line.translation || line.original;
  const sub = you ? line.translation : line.translation ? line.original : '';
  return (
    <View style={[s.bubble, you ? s.bubbleYou : s.bubbleThem, speaking && { borderStyle: 'dashed', borderColor: you ? color.blue : color.tertiary }]}>
      <Text style={[type.caption, { fontWeight: '700', color: you ? color.blue : color.teal }]}>
        {you ? 'You' : who}
        {speaking ? ' · speaking' : ''}
      </Text>
      <Text style={[type.body, { fontSize: 18, lineHeight: 26, fontWeight: '500' }]}>{main}</Text>
      {sub ? <Text style={[type.small, { color: color.body }]}>{sub}</Text> : null}
    </View>
  );
}

function ControlButton({ title, on, disabled, onPress }: { title: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={[s.control, on && { backgroundColor: color.surface, borderColor: color.lineStrong }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[type.callout, { fontWeight: '700' }]}>{title}</Text>
    </Pressable>
  );
}

function AskSheet(p: { visible: boolean; theirLanguage: string; phrase: string; yours?: string; busy: string | null; onClose: () => void; onAsk: () => void; onAgreed: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={s.backdrop} onPress={p.onClose} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[type.h2, { fontWeight: '800' }]}>Ask them first</Text>
          <Text style={type.sub}>The interpreter joins only if they agree. Say this, or let the app ask for you.</Text>
          <View style={s.phrase}>
            <Text style={[type.label, { color: color.teal }]}>In {p.theirLanguage}</Text>
            <Text style={[type.h3, { fontWeight: '700', lineHeight: 29 }]}>“{p.phrase}”</Text>
            {p.yours ? <Text style={[type.callout, { color: color.body }]}>{p.yours}</Text> : null}
          </View>
          <PillButton title={p.busy === 'ask' ? 'Asking…' : 'Ask for me'} kind="white" height={52} busy={p.busy === 'ask'} onPress={p.onAsk} icon={<Icon name="speaker" size={17} color={color.teal} />} />
          <View style={s.barRow}>
            <PillButton title="Not now" kind="white" onPress={p.onClose} style={{ flex: 0, paddingHorizontal: 20 }} />
            <PillButton title="They agreed: add it" kind="blue" busy={p.busy === 'add'} onPress={p.onAgreed} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  night: { flex: 1, backgroundColor: color.night, alignItems: 'stretch', paddingHorizontal: 24, gap: 24 },
  rings: { alignSelf: 'center', width: 196, height: 196, borderRadius: 98, borderWidth: 1, borderColor: '#2a3650', alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 152, height: 152, borderRadius: 76, borderWidth: 1, borderColor: '#3a4868', alignItems: 'center', justifyContent: 'center' },
  nightCard: { backgroundColor: color.nightCard, borderRadius: 18, paddingVertical: 6 },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#3a4868', alignItems: 'center', justifyContent: 'center' },
  endRound: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.green },
  pair: { fontSize: 12, fontWeight: '700', color: color.teal, backgroundColor: color.tealTint, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.night, borderRadius: 18, padding: 14, marginHorizontal: 16, marginTop: 12 },
  notice: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: color.amberTint, color: color.amberText },
  sysChip: { alignSelf: 'center', fontSize: 12, fontWeight: '600', color: color.body, backgroundColor: color.divider, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  bubble: { maxWidth: '86%', padding: 14, borderRadius: 18, gap: 6, borderWidth: 1 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: color.white, borderColor: color.line, borderBottomLeftRadius: 6 },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: color.blueTint, borderColor: color.blueTint, borderBottomRightRadius: 6 },
  controls: { paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  barRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 0 },
  control: { height: 52, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: color.line, backgroundColor: color.white, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(14,23,38,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 12, gap: 14 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineStrong },
  phrase: { backgroundColor: color.tealTint, borderRadius: 18, padding: 16, gap: 8 },
});
