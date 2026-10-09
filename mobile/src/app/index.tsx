import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp, FadeOut, SlideInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sentenceStarts } from '@shared/captions';
import { nativeLanguageName } from '@shared/languages';
import type { PlaceResult } from '@shared/types';
import { useActiveCall } from '@/call/ActiveCall';
import { useGlow } from '@/glow/GlowContext';
import type { GlowMode } from '@/glow/modes';
import { useAddErrand } from '@/hooks/useErrands';
import { useIntake } from '@/hooks/useIntake';
import { useIntakeContext } from '@/hooks/useIntakeContext';
import { usePhoneBook } from '@/hooks/usePhoneBook';
import { usePreferences } from '@/hooks/usePreferences';
import { useStartCall } from '@/hooks/useStartCall';
import { haptic } from '@/lib/haptics';
import { useSignedIn } from '@/lib/session';
import * as SecureStore from 'expo-secure-store';
import { useMenu } from '@/nav/Menu';
import { greetingFor, homeText } from '@/i18n/home';
import { MenuButton } from '@/nav/MenuButton';
import { useToast } from '@/ui/Toast';
import { RequestCard } from '@/talk/RequestCard';
import { Found, Searching } from '@/talk/Research';
import { Review } from '@/talk/Review';
import { color, type } from '@/theme/tokens';
import { Chip, RoundButton } from '@/ui/Button';
import { Bars } from '@/ui/Bars';
import { HoldToTalk, MicState } from '@/ui/HoldToTalk';
import { Icon } from '@/ui/Icon';
import { Screen, TopBar } from '@/ui/Screen';

/**
 * Call: Home and the conversation that sets up a call are one screen, so holding the talk
 * button on Home flows straight into Listening. Views: home → listening (held) → the assistant
 * asks (with answer chips) → looking it up → review & confirm → Call now.
 */
export default function CallScreen() {
  // Cancel starts over with a fresh conversation. ?contact=<id>: calling someone from the phone book.
  const { contact } = useLocalSearchParams<{ contact?: string }>();
  const [round, setRound] = useState(0);
  return <Conversation key={`${round}-${contact ?? ''}`} contactId={round === 0 ? contact : undefined} onReset={() => setRound((r) => r + 1)} />;
}

type View_ = 'home' | 'listening' | 'asks' | 'research' | 'review';

function Conversation({ contactId, onReset }: { contactId?: string; onReset: () => void }) {
  const { me } = useSignedIn();
  const prefs = usePreferences();
  const context = useIntakeContext(prefs.voice);
  const { callSeed } = usePhoneBook();
  // From the phone book: who to call is filled in and said first, so the assistant only asks what for.
  const [seed] = useState(() => {
    const c = contactId ? me.profile.contacts.find((x) => x.id === contactId) : undefined;
    return c ? callSeed(c) : undefined;
  });
  const intake = useIntake({ context, pushToTalk: true, keepLines: 30, seed });
  useEffect(() => {
    if (seed) void intake.start();
    // Once, when opened for a contact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { buildRequest, start, submitting, error: callError } = useStartCall();
  const queue = useAddErrand();
  const { follow } = useActiveCall();
  const [reviewing, setReviewing] = useState(true);

  const started = intake.live || intake.holding || intake.lines.length > 0 || intake.status === 'connecting';
  const view: View_ = !started
    ? 'home'
    : intake.holding
      ? 'listening'
      : intake.status === 'searching'
        ? 'research'
        : intake.ready && reviewing
          ? 'review'
          : 'asks';

  const glow: GlowMode =
    view === 'home' ? 'idle' : view === 'listening' ? 'listen' : view === 'research' ? 'think' : view === 'review' ? 'ready' : intake.status === 'speaking' ? 'speak' : 'idle';
  useGlow(glow);

  const cancel = () => {
    intake.stop();
    onReset();
  };

  const place = async () => {
    const created = await start(buildRequest(intake.draft, context, prefs.involvement));
    if (!created) return;
    intake.stop();
    follow(created.id);
    router.push({ pathname: '/call/[id]', params: { id: created.id } });
    onReset();
  };

  const toErrands = async () => {
    const errand = await queue.add(buildRequest(intake.draft, context, prefs.involvement));
    if (!errand) return;
    intake.stop();
    router.push('/errands');
    onReset();
  };

  // One talk button, always in the bottom controls (Home included), so it never moves under a
  // finger and a press that starts on Home carries straight into Listening.
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const center = height - Math.max(insets.bottom, 12) - 8 - 20 - 12 - 42;
  const [typing, setTyping] = useState(false);
  const dock = (
    <TalkDock
      view={view}
      center={center}
      holding={intake.holding}
      onPressIn={() => void intake.pressTalk()}
      onRelease={(tooShort) => void intake.releaseTalk(tooShort)}
      disabled={intake.status === 'connecting' && !intake.holding}
      onType={() => setTyping(true)}
    />
  );
  return (
    <View style={{ flex: 1 }}>
      {renderView()}
      {dock}
      {typing && (
        <TypeSheet
          placeholder={intake.choices?.question ? 'Type your answer' : 'Type a message'}
          onSend={(text) => {
            setTyping(false);
            void intake.choose(text);
          }}
          onClose={() => setTyping(false)}
        />
      )}
    </View>
  );

  function renderView() {
    if (view === 'home') return <Home onSuggestion={(t) => void intake.choose(t)} />;

    // Tap the voice pill to mute or unmute the assistant (its words still appear on screen).
    const languagePill =
      view === 'listening' ? (
        <View style={s.pill}>
          <Text style={[type.caption, { fontWeight: '500' }]}>
            I speak <Text style={{ color: color.ink }}>{nativeLanguageName(me.profile.preferredLanguage)}</Text>
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={intake.speakerOn ? 'Mute the assistant' : 'Unmute the assistant'}
          onPress={() => {
            haptic.select();
            intake.toggleSpeaker();
          }}
          hitSlop={6}
          style={s.pill}
        >
          <Text style={[type.caption, { fontWeight: '500' }]}>
            {intake.speakerOn ? 'Voice ' : 'Muted '}
            <Text style={{ color: color.ink }}>{cap(context.voice ?? 'marin')}</Text>
          </Text>
        </Pressable>
      );
    const header = (
      <TopBar
        left={
          <Pressable onPress={view === 'review' ? () => setReviewing(false) : cancel} style={s.pill} hitSlop={6}>
            <Text style={[type.caption, { color: color.ink, fontWeight: '500' }]}>{view === 'review' ? 'Back' : 'Cancel'}</Text>
          </Pressable>
        }
        right={view === 'review' ? <Text style={s.ready}>Ready to call</Text> : languagePill}
      />
    );

    if (view === 'review') {
      return (
        <Screen top={header} padding={0}>
          <Review
            draft={intake.draft}
            check={intake.check}
            userName={me.profile.name}
            involvement={prefs.involvement}
            onInvolvement={prefs.setInvolvement}
            onCall={() => void place()}
            onQueue={() => void toErrands()}
            busy={submitting || queue.submitting}
            error={callError ?? queue.error}
          />
        </Screen>
      );
    }

    const lastUser = last(intake.lines, (l) => l.role === 'user');
    const lastAssistant = last(intake.lines, (l) => l.role === 'assistant');
    const english = me.profile.preferredLanguage === 'English';

    const controls = <View style={{ height: DOCK_HEIGHT }} />;

    if (view === 'listening') {
      const heard = lastUser?.partial ? lastUser.text : '';
      // Your words appear just above your finger, wherever the button is.
      const top = insets.top + 60;
      return (
        <Screen top={header} padding={34}>
          <View style={[s.listening, { top, height: Math.max(120, center - 80 - top) }]}>
            <View style={s.label}>
              <Bars color={color.blue} />
              <Text style={[type.label, { color: color.blue }]}>Listening · release to send</Text>
            </View>
            <Text style={type.transcript} numberOfLines={6}>
              {heard}
              <Text style={{ color: color.blue }}>|</Text>
            </Text>
          </View>
        </Screen>
      );
    }

    if (view === 'research') {
      return (
        <Screen top={header} padding={20}>
          <ScrollView contentContainerStyle={{ paddingTop: 16 }}>
            <Searching asked={lastUser?.text} />
          </ScrollView>
        </Screen>
      );
    }

    // The assistant asks; the user answers by holding the button or tapping a chip.
    const speaking = intake.status === 'speaking';
    const thinking = intake.status === 'thinking' || intake.status === 'connecting';
    // Captions: the sentence being said (or the question asked) large, what came before it in the
    // same turn small above it, so a long answer never fills the screen.
    const said = lastAssistant?.text ?? '';
    const lastStart = sentenceStarts(said).at(-1) ?? 0;
    const asked = !speaking && intake.choices?.question ? intake.choices.question : '';
    const question = asked || said.slice(lastStart).trim();
    const before = asked ? said.slice(0, said.lastIndexOf(asked) >= 0 ? said.lastIndexOf(asked) : said.length).trim() : said.slice(0, lastStart).trim();
    const heard = lastUser?.partial ? lastUser.text : '';
    // What they just said, until the assistant starts answering it.
    const sent = lastUser && !lastUser.partial && intake.lines.lastIndexOf(lastUser) > (lastAssistant ? intake.lines.lastIndexOf(lastAssistant) : -1) ? lastUser : null;
    const showRequest = Boolean(intake.draft.counterpartName || intake.draft.task);
    return (
      <Screen top={header} bottom={controls} padding={0}>
        <ScrollView contentContainerStyle={s.asks} showsVerticalScrollIndicator={false}>
          <View style={s.label}>
            {speaking ? <Bars color={color.violet} /> : null}
            <Text style={[type.label, { color: speaking ? color.violet : color.secondary }]}>
              {speaking ? 'Speaking' : thinking ? 'Thinking…' : 'Your turn · hold to answer'}
            </Text>
          </View>
          {before ? (
            <Text style={[type.sub, s.before]} numberOfLines={3} ellipsizeMode="head">
              {before}
            </Text>
          ) : null}
          {question ? (
            <Animated.Text key={question.slice(0, 24)} entering={FadeInUp.duration(350)} style={[type.question, question.length > 90 && s.longQuestion]}>
              {question}
            </Animated.Text>
          ) : null}
          {!english && intake.choices?.questionEn ? <Text style={type.small}>{intake.choices.questionEn}</Text> : null}
          {intake.research && !intake.choices ? <Found result={intake.research} onPick={(p) => void intake.choose(pickText(p))} /> : null}
          <View style={s.chips}>
            {heard ? (
              <Animated.View entering={FadeIn} style={s.heard}>
                <Text style={type.callout}>{heard}</Text>
              </Animated.View>
            ) : sent ? (
              <SentLine key={sent.id} text={sent.text} />
            ) : null}
            {!speaking && intake.choices?.choices.map((c) => <Chip key={c} title={c} onPress={() => void intake.choose(c)} />)}
          </View>
          {intake.ready && !reviewing ? <Chip title="Review the call" variant="blue" onPress={() => setReviewing(true)} /> : null}
          {intake.error ? <Text style={[type.small, { color: color.redText }]}>{intake.error}</Text> : null}
        </ScrollView>
        {showRequest ? <RequestCard draft={intake.draft} need={intake.choices?.topic} /> : null}
      </Screen>
    );
  }
}

/** What the user just said: shown as heard, then fading back to show it's been sent. */
function SentLine({ text }: { text: string }) {
  const sent = useSharedValue(0);
  useEffect(() => {
    sent.value = withDelay(450, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [sent]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - 0.6 * sent.value, transform: [{ translateY: -6 * sent.value }] }));
  return (
    <Animated.View exiting={FadeOut.duration(250)} style={[s.heard, style]}>
      <Text style={type.callout}>{text}</Text>
    </Animated.View>
  );
}

const EDGE_HINT_KEY = 'callbridge.edgeHint.v1';

function Home({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const { hint } = useMenu();
  const toast = useToast();
  // Once: show where the menu lives (there's no menu button).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    void SecureStore.getItemAsync(EDGE_HINT_KEY).then((seen) => {
      if (seen) return;
      t = setTimeout(() => {
        hint();
        toast('Swipe in from the right edge for the menu');
        void SecureStore.setItemAsync(EDGE_HINT_KEY, '1');
      }, 900);
    });
    return () => clearTimeout(t);
  }, [hint, toast]);
  const { me } = useSignedIn();
  const t = homeText(me.profile.preferredLanguage);
  // Recent contacts first, then a nearby place.
  const recent = [...me.profile.contacts].sort((a, b) => (b.lastCalledAt ?? 0) - (a.lastCalledAt ?? 0)).slice(0, 2);
  const suggestions = [...recent.map((c) => t.call(c.name)), recent.length < 2 ? t.nearestRestaurant : null, t.nearestPharmacy].filter((x): x is string => Boolean(x)).slice(0, 3);
  const next = me.profile.appointments.filter((a) => a.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  return (
    <Screen top={<TopBar right={<MenuButton />} />} padding={24} bottom={<View style={{ height: DOCK_HEIGHT }} />}>
      <View style={{ gap: 6, marginTop: 8, paddingHorizontal: 6 }}>
        <Text style={type.sub}>{greetingFor(t, me.profile.name)}</Text>
        <Text style={type.title}>{t.title}</Text>
      </View>
      {next ? (
        <View style={{ marginTop: 18 }}>
          <Upcoming date={next.date} time={next.time} title={next.with} detail={next.description} />
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Text style={[type.caption, { textAlign: 'center', marginBottom: 12 }]}>The mic stays off until you hold. Or tap a suggestion.</Text>
      <View style={s.suggest}>
        {suggestions.map((x) => (
          <Chip key={x} variant="suggestion" title={x} onPress={() => onSuggestion(x)} />
        ))}
      </View>
    </Screen>
  );
}

function Upcoming({ date, time, title, detail }: { date: string; time: string; title: string; detail: string }) {
  const d = new Date(`${date}T12:00:00`);
  const [h = 0, m = 0] = time.split(':').map(Number);
  const t = new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={s.upcoming}>
      <View style={s.dateBlock}>
        <Text style={[type.label, { color: color.redText, fontSize: 11 }]}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
        <Text style={[type.h3, { fontSize: 22 }]}>{d.getDate()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { fontSize: 15 }]} numberOfLines={1}>
          {t} · {title}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Text style={type.caption}>Upcoming</Text>
    </View>
  );
}

/** Typing instead of talking: the same conversation, the words sent as typed. */
/**
 * The keyboard's height, followed as it moves. (KeyboardAvoidingView misses a keyboard that opens
 * before its first layout, which is what an autofocused field does, and left the sheet under it.)
 */
function useKeyboardLift() {
  const lift = useSharedValue(Keyboard.metrics()?.height ?? 0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const move = (height: number, duration?: number) => {
      lift.value = withTiming(height, { duration: duration || 250, easing: Easing.out(Easing.cubic) });
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => move(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift]);
  return lift;
}

function TypeSheet({ placeholder, onSend, onClose }: { placeholder: string; onSend: (text: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const send = () => text.trim() && onSend(text.trim());
  const keyboard = useKeyboardLift();
  const bottom = Math.max(insets.bottom, 12);
  // Above the keyboard when it's up (it covers the home-indicator area too), else above the inset.
  const raised = useAnimatedStyle(() => ({ transform: [{ translateY: keyboard.value > 0 ? -(keyboard.value - bottom + 12) : 0 }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={raised}>
        <Animated.View entering={SlideInDown.duration(220)} style={[s.sheet, { paddingBottom: bottom }]}>
          <View style={s.typeRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor={color.tertiary}
              style={[type.callout, { flex: 1, maxHeight: 120, color: color.ink }]}
              multiline
              autoFocus
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={send}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={send} disabled={!text.trim()} hitSlop={8} style={{ opacity: text.trim() ? 1 : 0.35 }}>
              <Icon name="send" size={30} color={color.blue} />
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Room the dock takes at the bottom of the conversation views. */
const DOCK_HEIGHT = 150;

/**
 * The talk button and its neighbours (speaker, mic state). On Home it sits large over the spot
 * Home leaves for it; in the conversation it moves down into the bottom controls. Review and
 * research hide it, but it stays mounted so a press is never cut off.
 */
function TalkDock({
  view,
  center,
  holding,
  onPressIn,
  onRelease,
  disabled,
  onType,
}: {
  view: View_;
  /** Where the button's center sits on screen (window y). */
  center: number;
  holding: boolean;
  onPressIn: () => void;
  onRelease: (tooShort: boolean) => void;
  disabled: boolean;
  /** Type an answer instead of saying it. */
  onType: () => void;
}) {
  const hidden = view === 'review' || view === 'research';
  return (
    <View pointerEvents={hidden ? 'none' : 'box-none'} style={[s.dock, { transform: [{ translateY: center - 60 }], opacity: hidden ? 0 : 1 }]}>
      <RoundButton label="Type instead" onPress={onType} size={58} bg={color.surface} ring={false}>
        <Icon name="keyboard" size={20} />
      </RoundButton>
      <HoldToTalk holding={holding} onPressIn={onPressIn} onRelease={onRelease} size={84} label="Hold to talk" disabled={disabled} />
      <View style={{ width: 58, alignItems: 'center' }}>
        <MicState on={holding} />
      </View>
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pickText = (p: PlaceResult) => `${p.name}${p.address ? `, ${p.address}` : ''}${p.phone ? ` (${p.phone})` : ''}`;
function last<T>(list: T[], test: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i]!)) return list[i];
  return undefined;
}

const s = StyleSheet.create({
  pill: { height: 36, borderRadius: 18, backgroundColor: color.surface, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  ready: { ...type.label, textTransform: 'none', letterSpacing: 0, color: color.blue, backgroundColor: color.blueTint, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5, overflow: 'hidden' },
  middle: { flex: 1, justifyContent: 'center', gap: 14 },
  listening: { position: 'absolute', left: 34, right: 34, justifyContent: 'flex-end', gap: 14 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheet: { backgroundColor: color.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18 },
  typeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, minHeight: 50, borderRadius: 25, backgroundColor: color.surface, paddingHorizontal: 16, paddingVertical: 10 },
  dock: { position: 'absolute', left: 0, right: 0, top: 0, height: 120, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 },
  before: { opacity: 0.8 },
  longQuestion: { fontSize: 24, lineHeight: 32 },
  asks: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 34, paddingVertical: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  heard: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.9)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: 14, marginBottom: 8 },
  dateBlock: { width: 44, alignItems: 'center' },
});
