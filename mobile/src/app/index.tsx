import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captionText, sentenceStarts } from '@shared/captions';
import type { Contact, PlaceResult } from '@shared/types';
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
import { Found } from '@/talk/Research';
import { Review } from '@/talk/Review';
import { color, glowPalette, type } from '@/theme/tokens';
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

type View_ = 'home' | 'listening' | 'asks' | 'review';

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
  // Who, the number and what for are enough to review, whether or not the assistant finished
  // (it can say "review it on screen" and forget to put the review there).
  const hasRequest = Boolean(intake.draft.counterpartName && intake.draft.phoneNumber && (intake.draft.task || intake.draft.taskInUserLanguage));
  // Offered only once the assistant has finished its turn without opening the review: while it's
  // still talking it's about to (and a button that appears and vanishes is worse than none).
  const canReview = hasRequest && !intake.ready && intake.status === 'yourTurn';
  const [openedReview, setOpenedReview] = useState(false);
  // Which of the user's lines was last when these results came in: the cards stay up until they
  // answer after them (the assistant may save its top suggestion before they've chosen).
  const [resultsAfter, setResultsAfter] = useState<{ research: unknown; userLine?: string } | null>(null);
  const lastUserLine = last(intake.lines, (l) => l.role === 'user' && !l.partial)?.id;
  useEffect(() => {
    if (intake.research) setResultsAfter({ research: intake.research, userLine: lastUserLine });
    // Only when new results arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake.research]);
  const answeredResults = resultsAfter !== null && resultsAfter.research === intake.research && lastUserLine !== resultsAfter.userLine;
  const showPlaces = Boolean(intake.research?.places.length) && !(answeredResults && intake.draft.phoneNumber);

  const started = intake.live || intake.holding || intake.lines.length > 0 || intake.status === 'connecting';
  const view: View_ = !started
    ? 'home'
    : intake.holding && !intake.lines.some((l) => l.role === 'assistant')
      ? // The first turn, from Home: nothing to answer yet, so the words get the screen. Later
        // turns stay on the conversation, so the question and cards don't vanish mid-answer.
        'listening'
      : (intake.ready && reviewing) || (openedReview && hasRequest)
          ? 'review'
          : 'asks';

  const glow: GlowMode =
    view === 'home' ? 'idle' : view === 'listening' || intake.holding ? 'listen' : intake.status === 'searching' ? 'search' : view === 'review' ? 'ready' : intake.status === 'speaking' ? 'speak' : 'idle';
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
      onEnd={cancel}
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
    if (view === 'home') return <Home onSuggestion={(t) => void intake.choose(t)} onContact={(c) => void intake.startWith(callSeed(c))} />;

    // While conversing there's no top bar (more room for the conversation; End is in the dock).
    // Review keeps one: Back to the conversation, and that it's ready.
    const header = (
      <TopBar
        left={
          <Pressable onPress={() => (setReviewing(false), setOpenedReview(false))} style={s.pill} hitSlop={6}>
            <Text style={[type.caption, { color: color.ink, fontWeight: '500' }]}>Back</Text>
          </Pressable>
        }
        right={<Text style={s.ready}>Ready to call</Text>}
      />
    );
    const spacer = <View style={{ height: 16 }} />;

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
      // Your words fill the space above the button, growing upward from just over your finger.
      return (
        <Screen top={spacer} bottom={controls} padding={34}>
          <View style={s.listening}>
            <View style={s.label}>
              <Bars color={color.blue} />
              <Text style={[type.label, { color: color.blue }]}>Listening · release to send</Text>
            </View>
            <Text style={[type.transcript, !heard && { color: color.tertiary }]} numberOfLines={6} adjustsFontSizeToFit minimumFontScale={0.75}>
              {heard || 'Say who to call, or what you need…'}
              <Text style={{ color: color.blue }}>|</Text>
            </Text>
          </View>
        </Screen>
      );
    }


    // The assistant asks; the user answers by holding the button or tapping a chip.
    const speaking = intake.status === 'speaking';
    const thinking = intake.status === 'thinking' || intake.status === 'connecting';
    const searching = intake.status === 'searching';
    // Captions: the sentence being said (or the question asked) large, what came before it in the
    // same turn small above it, so a long answer never fills the screen.
    const said = captionText(lastAssistant?.text ?? '');
    const lastStart = sentenceStarts(said).at(-1) ?? 0;
    const asked = !speaking && intake.choices?.question ? captionText(intake.choices.question) : '';
    const question = asked || said.slice(lastStart).trim();
    const before = asked ? said.slice(0, said.lastIndexOf(asked) >= 0 ? said.lastIndexOf(asked) : said.length).trim() : said.slice(0, lastStart).trim();
    const heard = lastUser?.partial ? lastUser.text : '';
    // What they just said, until the assistant starts answering it.
    const sent = lastUser && !lastUser.partial && intake.lines.lastIndexOf(lastUser) > (lastAssistant ? intake.lines.lastIndexOf(lastAssistant) : -1) ? lastUser : null;
    const showRequest = Boolean(intake.draft.counterpartName || intake.draft.task);
    // Something besides answer chips is in the action area (place cards now; more later): the
    // captions step down to give it room.
    const roomy = !showPlaces;
    return (
      <Screen top={showRequest ? <RequestCard draft={intake.draft} need={intake.choices?.topic} onPress={canReview ? () => (setReviewing(true), setOpenedReview(true)) : undefined} /> : spacer} bottom={controls} padding={0}>
        {/* Two zones, so captions changing as the assistant talks never move what you tap: the
            captions fill the space above and grow upward from its bottom edge, like subtitles;
            the cards and answers sit below and move only when they change themselves. */}
        <View style={s.stage}>
          <View style={s.label}>
            {/* Bars for a voice (yours, the assistant's); a spinner in the search glow's color for a lookup. */}
            {intake.holding ? <Bars color={color.blue} /> : searching ? <ActivityIndicator size="small" color={SEARCH_INK} /> : speaking ? <Bars color={color.violet} /> : null}
            <Text style={[type.label, { color: intake.holding ? color.blue : searching ? SEARCH_INK : speaking ? color.violet : color.secondary }]}>
              {intake.holding ? 'Listening · release to send' : searching ? 'Looking it up…' : speaking ? 'Speaking' : thinking ? 'Thinking…' : 'Your turn · hold to answer'}
            </Text>
            {/* Talking or typing also stops it; the glow shows it's working. */}
            {searching && !intake.holding ? (
              <Text accessibilityRole="button" onPress={() => (haptic.select(), intake.stopSearch())} style={[type.label, s.stop]} suppressHighlighting>
                Stop
              </Text>
            ) : null}
          </View>
          {before && !roomy ? null : before ? (
            <Text style={[type.sub, s.before]} numberOfLines={2} ellipsizeMode="head">
              {before}
            </Text>
          ) : null}
          {question ? (
            <Animated.Text
              key={question.slice(0, 24)}
              entering={FadeIn.duration(250)}
              // Two sizes only: large for a short line with the room for it, small otherwise.
              style={[type.question, (!roomy || question.length > 70) && s.questionSmall]}
              numberOfLines={roomy ? 5 : 3}
              ellipsizeMode="head"
            >
              {question}
            </Animated.Text>
          ) : null}
          {!english && intake.choices?.questionEn ? (
            <Text style={type.small} numberOfLines={roomy ? 2 : 1}>
              {intake.choices.questionEn}
            </Text>
          ) : null}
          {intake.holding || heard ? (
            // Your answer, live, under the question it answers; on release it fades back as sent.
            <Animated.View entering={FadeIn.duration(150)} style={s.heard}>
              <Text style={[type.callout, s.heardText, !heard && { color: color.tertiary }]} numberOfLines={4}>
                {heard || 'Listening…'}
                <Text style={{ color: color.blue }}>|</Text>
              </Text>
            </Animated.View>
          ) : sent ? (
            <SentLine key={sent.id} text={sent.text} />
          ) : null}
        </View>
        <View style={s.act}>
          {/* The places stay up, next to the conversation, until one is chosen. */}
          {showPlaces && intake.research ? (
            <Found result={intake.research} note={false} onPick={(p) => void intake.choose(pickText(p))} />
          ) : intake.research && !intake.research.places.length && !intake.choices && !intake.draft.phoneNumber ? (
            <Found result={intake.research} onPick={(p) => void intake.choose(pickText(p))} />
          ) : null}
          {intake.choices?.choices.length ? (
            // Dimmed, not hidden, while the assistant is still talking (a tap interrupts it).
            <View style={[s.chips, speaking && { opacity: 0.55 }]}>
              {intake.choices.choices.map((c) => (
                <Chip key={c} title={c} onPress={() => void intake.choose(c)} />
              ))}
            </View>
          ) : null}
          {(intake.ready || canReview) && !(intake.ready && reviewing) ? <Chip title="Review the call" variant="blue" onPress={() => (setReviewing(true), setOpenedReview(true))} /> : null}
          {intake.error ? <Text style={[type.small, { color: color.redText }]}>{intake.error}</Text> : null}
        </View>
      </Screen>
    );
  }
}

/** What the user just said: the live bubble, kept on release and fading back to show it's been sent. */
function SentLine({ text }: { text: string }) {
  const sent = useSharedValue(0);
  useEffect(() => {
    sent.value = withDelay(450, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [sent]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - 0.6 * sent.value, transform: [{ translateY: -6 * sent.value }] }));
  return (
    <Animated.View exiting={FadeOut.duration(250)} style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
      <Animated.View style={[s.heard, { maxWidth: '100%' }, style]}>
        <Text style={[type.callout, s.heardText]} numberOfLines={4}>
          {text}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/** The search glow's violet, for the "Looking it up" label. */
const SEARCH_INK = glowPalette.search[2];

const EDGE_HINT_KEY = 'callbridge.edgeHint.v1';

function Home({ onSuggestion, onContact }: { onSuggestion: (text: string) => void; onContact: (c: Contact) => void }) {
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
  // A contact starts with who to call filled in (like the phone book's Call button); a place is asked for.
  const suggestions: { title: string; run: () => void }[] = [
    ...recent.map((c) => ({ title: t.call(c.name), run: () => onContact(c) })),
    ...[recent.length < 2 ? t.nearestRestaurant : null, t.nearestPharmacy].filter((x): x is string => Boolean(x)).map((x) => ({ title: x, run: () => onSuggestion(x) })),
  ].slice(0, 3);
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
          <Chip key={x.title} variant="suggestion" title={x.title} onPress={x.run} />
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
  onEnd,
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
  /** Ends the conversation (the right slot, once one has started; Home shows the mic state). */
  onEnd: () => void;
}) {
  const hidden = view === 'review';
  return (
    <View pointerEvents={hidden ? 'none' : 'box-none'} style={[s.dock, { transform: [{ translateY: center - 60 }], opacity: hidden ? 0 : 1 }]}>
      <RoundButton label="Type instead" onPress={onType} size={58} bg={color.surface} ring={false}>
        <Icon name="keyboard" size={20} />
      </RoundButton>
      <HoldToTalk holding={holding} onPressIn={onPressIn} onRelease={onRelease} size={84} label="Hold to talk" disabled={disabled} />
      {view === 'home' || holding ? (
        <View style={{ width: 58, alignItems: 'center' }}>
          <MicState on={holding} />
        </View>
      ) : (
        <RoundButton label="End conversation" onPress={onEnd} size={58} bg={color.surface} ring={false}>
          <Icon name="close" size={18} />
        </RoundButton>
      )}
    </View>
  );
}

const pickText = (p: PlaceResult) => `${p.name}${p.address ? `, ${p.address}` : ''}${p.phone ? ` (${p.phone})` : ''}`;
function last<T>(list: T[], test: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i]!)) return list[i];
  return undefined;
}

const s = StyleSheet.create({
  pill: { height: 36, borderRadius: 18, backgroundColor: color.surface, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  ready: { ...type.label, textTransform: 'none', letterSpacing: 0, color: color.blue, backgroundColor: color.blueTint, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5, overflow: 'hidden' },
  middle: { flex: 1, justifyContent: 'center', gap: 14 },
  listening: { flex: 1, justifyContent: 'flex-end', gap: 14, paddingBottom: 20 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheet: { backgroundColor: color.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18 },
  typeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, minHeight: 50, borderRadius: 25, backgroundColor: color.surface, paddingHorizontal: 16, paddingVertical: 10 },
  dock: { position: 'absolute', left: 0, right: 0, top: 0, height: 120, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 },
  before: { opacity: 0.8 },
  stop: { color: color.blue, marginLeft: 6, paddingHorizontal: 4 },
  questionSmall: { fontSize: 22, lineHeight: 29, letterSpacing: -0.2 },
  stage: { flex: 1, justifyContent: 'flex-end', gap: 12, paddingHorizontal: 34, paddingBottom: 14, overflow: 'hidden' },
  act: { gap: 12, paddingHorizontal: 34, paddingBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heard: { alignSelf: 'flex-end', maxWidth: '88%', borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.92)' },
  heardText: { fontSize: 17, lineHeight: 23 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: 14, marginBottom: 8 },
  dateBlock: { width: 44, alignItems: 'center' },
});
