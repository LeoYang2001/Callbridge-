import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeLanguageName } from '@shared/languages';
import type { PlaceResult } from '@shared/types';
import { useActiveCall } from '@/call/ActiveCall';
import { useGlow } from '@/glow/GlowContext';
import type { GlowMode } from '@/glow/modes';
import { useAddErrand } from '@/hooks/useErrands';
import { useIntake } from '@/hooks/useIntake';
import { useIntakeContext } from '@/hooks/useIntakeContext';
import { usePreferences } from '@/hooks/usePreferences';
import { useStartCall } from '@/hooks/useStartCall';
import { useSignedIn } from '@/lib/session';
import { MenuButton } from '@/nav/MenuButton';
import { RequestCard } from '@/talk/RequestCard';
import { Found, Searching, UserBubble } from '@/talk/Research';
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
  // Cancel starts over with a fresh conversation.
  const [round, setRound] = useState(0);
  return <Conversation key={round} onReset={() => setRound((r) => r + 1)} />;
}

type View_ = 'home' | 'listening' | 'asks' | 'research' | 'review';

function Conversation({ onReset }: { onReset: () => void }) {
  const { me } = useSignedIn();
  const prefs = usePreferences();
  const context = useIntakeContext(prefs.voice);
  const intake = useIntake({ context, pushToTalk: true, keepLines: 30 });
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

  // One talk button for every view, so a press that starts on Home carries on into Listening.
  const [homeSpot, setHomeSpot] = useState<number | null>(null);
  const dock = (
    <TalkDock
      view={view}
      homeCenterY={homeSpot}
      holding={intake.holding}
      onPressIn={() => void intake.pressTalk()}
      onRelease={intake.releaseTalk}
      disabled={intake.status === 'connecting' && !intake.holding}
      speakerOn={intake.speakerOn}
      onToggleSpeaker={intake.toggleSpeaker}
    />
  );
  return (
    <View style={{ flex: 1 }}>
      {renderView()}
      {dock}
    </View>
  );

  function renderView() {
    if (view === 'home') return <Home onSpot={setHomeSpot} onSuggestion={(t) => void intake.choose(t)} />;

    const languagePill = (
      <View style={s.pill}>
        <Text style={[type.caption, { fontWeight: '500' }]}>
          {view === 'listening' ? 'I speak ' : 'Voice '}
          <Text style={{ color: color.ink }}>{view === 'listening' ? nativeLanguageName(me.profile.preferredLanguage) : cap(context.voice ?? 'marin')}</Text>
        </Text>
      </View>
    );
    const top = (
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
        <Screen top={top} padding={0}>
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
      return (
        <Screen top={top} bottom={controls} padding={34}>
          <View style={s.middle}>
            <View style={s.label}>
              <Bars color={color.blue} />
              <Text style={[type.label, { color: color.blue }]}>Listening · release to send</Text>
            </View>
            <Text style={[type.transcript, { minHeight: 86 }]}>
              {heard}
              <Text style={{ color: color.blue }}>|</Text>
            </Text>
          </View>
        </Screen>
      );
    }

    if (view === 'research') {
      return (
        <Screen top={top} padding={20}>
          <ScrollView contentContainerStyle={{ paddingTop: 16 }}>
            <Searching asked={lastUser?.text} />
          </ScrollView>
        </Screen>
      );
    }

    // The assistant asks; the user answers by holding the button or tapping a chip.
    const speaking = intake.status === 'speaking';
    const thinking = intake.status === 'thinking' || intake.status === 'connecting';
    const question = intake.choices?.question || lastAssistant?.text || '';
    const heard = lastUser?.partial ? lastUser.text : '';
    const showRequest = Boolean(intake.draft.counterpartName || intake.draft.task);
    return (
      <Screen top={top} bottom={controls} padding={0}>
        <ScrollView contentContainerStyle={s.asks} showsVerticalScrollIndicator={false}>
          <View style={s.label}>
            {speaking ? <Bars color={color.violet} /> : null}
            <Text style={[type.label, { color: speaking ? color.violet : color.secondary }]}>
              {speaking ? 'Speaking' : thinking ? 'Thinking…' : 'Your turn · hold to answer'}
            </Text>
          </View>
          {question ? (
            <Animated.Text key={question.slice(0, 24)} entering={FadeInUp.duration(350)} style={type.question}>
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
            ) : null}
            {!speaking && intake.choices?.choices.map((c) => <Chip key={c} title={c} onPress={() => void intake.choose(c)} />)}
          </View>
          {intake.ready && !reviewing ? <Chip title="Review the call" variant="blue" onPress={() => setReviewing(true)} /> : null}
          {intake.error ? <Text style={[type.small, { color: color.redText }]}>{intake.error}</Text> : null}
          {lastUser && !lastUser.partial && !question ? <UserBubble text={lastUser.text} /> : null}
        </ScrollView>
        {showRequest ? <RequestCard draft={intake.draft} need={intake.choices?.topic} /> : null}
      </Screen>
    );
  }
}

function Home({ onSpot, onSuggestion }: { onSpot: (centerY: number) => void; onSuggestion: (text: string) => void }) {
  const spot = useRef<View>(null);
  const { me } = useSignedIn();
  const name = me.profile.name;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const contacts = me.profile.contacts.slice(0, 2).map((c) => `Call ${c.relationship ? `my ${c.relationship}` : c.name}`);
  const suggestions = [...contacts, 'The nearest pharmacy'].slice(0, 3);
  const next = me.profile.appointments.filter((a) => a.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  return (
    <Screen top={<TopBar right={<MenuButton />} />} padding={30}>
      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={type.sub}>
          {greeting}
          {name ? `, ${name}` : ''}
        </Text>
        <Text style={type.title}>Who should I call?</Text>
      </View>
      <View style={s.center}>
        {/* The talk button (in the dock) sits over this spot on Home. */}
        <View
          ref={spot}
          style={{ width: 104, height: HOME_BUTTON_BLOCK }}
          onLayout={() => spot.current?.measureInWindow((_x, y, _w, h) => onSpot(y + h / 2))}
        />
        <Text style={[type.caption, { textAlign: 'center', marginTop: 4 }]}>The mic stays off until you hold. Or tap a suggestion.</Text>
      </View>
      <View style={s.suggest}>
        {suggestions.map((t) => (
          <Chip key={t} variant="suggestion" title={t} onPress={() => onSuggestion(t)} />
        ))}
      </View>
      {next ? <Upcoming date={next.date} time={next.time} title={next.with} detail={next.description} /> : <View style={{ height: 12 }} />}
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

/** Room the dock takes at the bottom of the conversation views. */
const DOCK_HEIGHT = 150;
/** The Home button and its label. */
const HOME_BUTTON_BLOCK = 104 + 12 + 20;

/**
 * The talk button and its neighbours (speaker, mic state). On Home it sits large over the spot
 * Home leaves for it; in the conversation it moves down into the bottom controls. Review and
 * research hide it, but it stays mounted so a press is never cut off.
 */
function TalkDock({
  view,
  homeCenterY,
  holding,
  onPressIn,
  onRelease,
  disabled,
  speakerOn,
  onToggleSpeaker,
}: {
  view: View_;
  homeCenterY: number | null;
  holding: boolean;
  onPressIn: () => void;
  onRelease: (tooShort: boolean) => void;
  disabled: boolean;
  speakerOn: boolean;
  onToggleSpeaker: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const home = view === 'home';
  const hidden = view === 'review' || view === 'research';
  // Where the button's center goes: over Home's spot, or in the bottom controls.
  const bottomCenter = height - Math.max(insets.bottom, 12) - 8 - 20 - 12 - 42;
  const center = home && homeCenterY != null ? homeCenterY : bottomCenter;
  const y = useSharedValue(center);
  useEffect(() => {
    y.value = withTiming(center, { duration: 350 });
  }, [center, y]);
  const pos = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - 60 }] }));
  const sides = useAnimatedStyle(() => ({ opacity: withTiming(home ? 0 : 1, { duration: 250 }) }));
  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[s.dock, pos, { opacity: hidden ? 0 : 1 }]}>
      <Animated.View style={sides} pointerEvents={home ? 'none' : 'auto'}>
        <RoundButton label={speakerOn ? 'Mute the assistant' : 'Unmute the assistant'} onPress={onToggleSpeaker} size={58} bg={color.surface} ring={false}>
          <Icon name={speakerOn ? 'speaker' : 'speakerOff'} size={20} />
        </RoundButton>
      </Animated.View>
      <HoldToTalk holding={holding} onPressIn={onPressIn} onRelease={onRelease} size={home ? 104 : 84} label={home ? 'Hold to talk' : 'Hold to answer'} disabled={disabled} />
      <Animated.View style={[{ width: 58, alignItems: 'center' }, sides]}>
        <MicState on={holding} />
      </Animated.View>
    </Animated.View>
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
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dock: { position: 'absolute', left: 0, right: 0, top: 0, height: 120, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 },
  asks: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 34, paddingVertical: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  heard: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.9)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.white, borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: 14, marginBottom: 8 },
  dateBlock: { width: 44, alignItems: 'center' },
});
