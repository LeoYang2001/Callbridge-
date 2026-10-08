import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { CallRecord, IntakeDraft, Me, ResearchResult } from '@shared/types';
import { HoldQuestion, Live, Ringing } from '@/call/LiveViews';
import { Result } from '@/call/Result';
import { useGlow } from '@/glow/GlowContext';
import type { GlowMode } from '@/glow/modes';
import { PreviewSessionProvider } from '@/lib/session';
import { RequestCard } from '@/talk/RequestCard';
import { Found, Searching } from '@/talk/Research';
import { Review } from '@/talk/Review';
import { color, type } from '@/theme/tokens';
import { Chip } from '@/ui/Button';
import { Bars } from '@/ui/Bars';
import { HoldToTalk, MicState } from '@/ui/HoldToTalk';
import { Screen } from '@/ui/Screen';
import PhoneBook from '../contacts';
import ContactScreen from '../contacts/[id]';
import CallScreen from '../index';
import MeScreen from '../me';
import NotificationsScreen from '../notifications';

/** Development only: the new screens with sample data and no server, for checking the design. */

const ME: Me = {
  id: 'preview',
  phone: '+19015550199',
  profile: {
    name: '伟',
    preferredLanguage: 'Chinese (Mandarin)',
    otherLanguages: [],
    timezone: 'America/Chicago',
    usualAvailability: [],
    preferences: [],
    contacts: [
      { id: 'sd', name: 'Smile Dental', phone: '+19015550142', relationship: 'dentist', language: 'English', notes: ['Asks for the insurance card at check-in'], callCount: 4, lastOutcome: '已预约：10月8日周四 下午2:00' },
      { id: 'long', name: 'Memphis Family & Cosmetic Dentistry of Germantown', phone: '+19015550177', relationship: 'dentist (the new one)', language: 'English', address: '7690 Farmington Blvd, Suite 210, Germantown, TN 38138', notes: ['Asks for the insurance card and a photo ID at check-in, and wants new patients 15 minutes early'], callCount: 1, lastOutcome: '已预约：10月20日周二 上午9:30，需要带保险卡和身份证' },
      { id: 'ts', name: 'Tabito Sato', phone: '+19015552290', relationship: 'friend', language: 'Japanese', notes: [], callCount: 3, lastOutcome: '已转达：今晚的读经去不了' },
      { id: 'm', name: 'Maria', phone: '+17472836440', relationship: 'girlfriend', notes: [], callCount: 12 },
    ],
    shareable: [
      { label: 'Date of birth', value: '1988-03-14' },
      { label: 'Insurance member ID', value: 'AET-4471', off: true },
    ],
    appointments: [{ id: 'a', date: '2026-10-15', time: '14:00', with: 'Smile Dental', description: '洗牙 · bring insurance card', callId: 'c' }],
    history: [],
    onboarded: true,
  },
};

const DRAFT: IntakeDraft = {
  counterpartName: 'Smile Dental',
  phoneNumber: '9015550142',
  task: 'Book a cleaning for Wei next week, afternoon if possible. Existing patient.',
  taskInUserLanguage: '预约洗牙 · 下周下午',
  callLanguage: 'English',
  availability: [{ days: ['tue', 'wed', 'thu'], start: '13:00', end: '17:00' }],
};

const FOUND: ResearchResult = {
  answer: '附近有 3 家。网上写的时间不一定准，要我打电话问吗？',
  sources: [],
  places: [
    { name: 'La Esquina Taqueria', phone: '+19015550187', distanceMeters: 640, openNow: true, rating: 4.6, ratingCount: 812, source: 'google', verified: true },
    { name: 'Taquería El Sol', phone: '+19015550123', distanceMeters: 1770, openNow: true, rating: 4.4, ratingCount: 230, source: 'web', verified: false },
    { name: 'Casa Oaxaca', phone: '+19015550311', distanceMeters: 2900, rating: 4.7, source: 'google', verified: true, inPhoneBookAs: 'Casa Oaxaca' },
  ],
};

const CALL: CallRecord = {
  id: 'preview-call',
  createdAt: Date.now() - 90_000,
  status: 'connected',
  request: {
    to: '+19015550142',
    counterpartName: 'Smile Dental',
    user: { name: '伟', preferredLanguage: 'Chinese (Mandarin)' },
    callLanguage: 'English',
    timezone: 'America/Chicago',
    authorizedInfo: [],
    instructions: 'Book a cleaning',
    involvement: 'supervised',
    constraints: { availability: [], maxAdditionalCostUsd: 0 },
  },
  transcript: [
    { id: '1', speaker: 'assistant', text: "Hi, I'm an AI assistant calling for Wei to book a cleaning.", translation: '您好，我是替伟打电话的 AI 助理，想预约洗牙。', at: 0 },
    { id: '2', speaker: 'counterpart', text: 'Thank you for calling Smile Dental, this is Maria.', translation: '您好，Smile Dental，我是 Maria。', at: 0 },
  ],
  questions: [{ id: 'q', askedAt: Date.now() - 2000, expiresAt: Date.now() + 28_000, category: 'additional_cost', question: "Would he also like a full set of X-rays? That's $80 extra.", questionInUserLanguage: '要加做全套 X 光吗？需额外付 $80。', amountUsd: 80, status: 'pending' }],
  unresolvedQuestions: [],
  commitments: [],
  decisions: [],
  metrics: { answeredAt: Date.now() - 83_000, turnLatenciesMs: [], interruptions: 0 },
  events: [],
} as unknown as CallRecord;

const DONE: CallRecord = {
  ...CALL,
  status: 'completed',
  questions: [],
  result: {
    status: 'completed',
    success: true,
    objective: 'x',
    appointment: { date: '2026-10-15', time: '14:00', notes: 'Cleaning' },
    commitments: [],
    additionalChargesAuthorized: false,
    unresolvedQuestions: [],
    refusedDecisions: [],
    followUpsForUser: [],
    summary: 'Booked a cleaning for Thursday, Oct 15 at 2:00 pm. Bring the insurance card.',
    summaryInUserLanguage: '约好了：10月15日周四下午2点洗牙。',
    headlineInUserLanguage: '约好了：周四下午2点',
    nextStepsInUserLanguage: ['带上保险卡', '提前10分钟到'],
    policyWarnings: [],
  },
} as CallRecord;

const VIEWS = ['home', 'contact', 'asks', 'searching', 'found', 'review', 'ringing', 'live', 'hold', 'result', 'no answer', 'book', 'me', 'notif'] as const;
type V = (typeof VIEWS)[number];
const GLOW: Record<V, GlowMode> = { home: 'idle', asks: 'idle', searching: 'think', found: 'idle', review: 'ready', ringing: 'ring', live: 'hair', hold: 'hold', result: 'done', 'no answer': 'fail', book: 'none', me: 'none', notif: 'none', contact: 'none' };

export default function Preview() {
  const params = useLocalSearchParams<{ v?: string }>();
  const [v, setV] = useState<V>((VIEWS as readonly string[]).includes(params.v ?? '') ? (params.v as V) : 'home');
  return (
    <PreviewSessionProvider me={ME}>
      <View style={{ flex: 1 }}>
        {v === 'home' ? <CallScreen /> : v === 'book' ? <PhoneBook /> : v === 'contact' ? <ContactPreview /> : v === 'me' ? <MeScreen /> : v === 'notif' ? <NotificationsScreen /> : <Static v={v} />}
        <View style={{ position: 'absolute', bottom: 34, left: 0, right: 0 }}>
          <ScrollView horizontal contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }} showsHorizontalScrollIndicator={false}>
            {VIEWS.map((x) => (
              <Chip key={x} title={x} selected={x === v} onPress={() => setV(x)} />
            ))}
            <Chip title="exit" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
          </ScrollView>
        </View>
      </View>
    </PreviewSessionProvider>
  );
}

/** The contact screen reads its id from the route; the preview shows the long-text contact. */
function ContactPreview() {
  return <ContactScreen />;
}

function Static({ v }: { v: Exclude<V, 'home' | 'book' | 'me' | 'notif' | 'contact'> }) {
  useGlow(GLOW[v], v === 'hold' ? 28 / 30 : 1);
  if (v === 'ringing' || v === 'live' || v === 'hold' || v === 'result' || v === 'no answer') {
    const noAnswer = { ...CALL, status: 'failed', questions: [], failureReason: '没人接听，20分钟后再试。', result: undefined } as unknown as CallRecord;
    return (
      <Screen padding={0} bottom={<View style={{ height: 70 }} />}>
        {v === 'ringing' && <Ringing call={{ ...CALL, status: 'dialing' }} onCancel={() => {}} />}
        {v === 'live' && <Live call={CALL} seconds={83} userName="伟" listening={false} listenBusy={false} onListen={() => {}} onEnd={() => {}} onMessage={() => {}} onTranscript={() => {}} />}
        {v === 'hold' && <HoldQuestion q={CALL.questions![0]!} limitUsd={0} remaining={28} english={false} onAnswer={() => {}} busy={false} error={null} />}
        {v === 'result' && <Result call={DONE} english={false} onDone={() => {}} onTryAgain={() => {}} onTalk={() => {}} onTranscript={() => {}} retrying={false} />}
        {v === 'no answer' && <Result call={noAnswer} english={false} onDone={() => {}} onTryAgain={() => {}} onTalk={() => {}} onTranscript={() => {}} retrying={false} />}
      </Screen>
    );
  }
  if (v === 'review') {
    return (
      <Screen padding={0}>
        <Review draft={DRAFT} check={null} userName="伟" involvement="supervised" onInvolvement={() => {}} onCall={() => {}} onQueue={() => {}} busy={false} error={null} />
        <View style={{ height: 60 }} />
      </Screen>
    );
  }
  if (v === 'searching' || v === 'found') {
    return (
      <Screen padding={20}>
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}>{v === 'searching' ? <Searching asked="最近的墨西哥餐厅今晚几点关门？" /> : <Found result={FOUND} onPick={() => {}} />}</ScrollView>
      </Screen>
    );
  }
  return (
    <Screen padding={0}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 34 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Bars color={color.violet} />
          <Text style={[type.label, { color: color.violet }]}>Speaking</Text>
        </View>
        <Text style={type.question}>好的，Smile Dental。您以前在那里看过牙吗？</Text>
        <Text style={type.small}>Got it, Smile Dental. Have you been there before?</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Chip title="是，老患者" onPress={() => {}} />
          <Chip title="第一次去" onPress={() => {}} />
        </View>
      </View>
      <RequestCard draft={DRAFT} need="是否老患者？" />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28, paddingTop: 22, paddingBottom: 90 }}>
        <View style={{ width: 58 }} />
        <HoldToTalk holding={false} onPressIn={() => {}} onRelease={() => {}} label="Hold to answer" />
        <MicState on={false} />
      </View>
    </Screen>
  );
}
