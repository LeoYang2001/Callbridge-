import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { IntakeDraft, Me, ResearchResult } from '@shared/types';
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
import CallScreen from '../index';

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
    shareable: [],
    preferences: [],
    contacts: [
      { id: 'sd', name: 'Smile Dental', phone: '+19015550142', relationship: 'dentist', notes: [], callCount: 4 },
      { id: 'm', name: 'Maria', phone: '+17472836440', relationship: 'girlfriend', notes: [], callCount: 12 },
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

const VIEWS = ['home', 'asks', 'searching', 'found', 'review'] as const;
type V = (typeof VIEWS)[number];
const GLOW: Record<V, GlowMode> = { home: 'idle', asks: 'idle', searching: 'think', found: 'idle', review: 'ready' };

export default function Preview() {
  const [v, setV] = useState<V>('home');
  return (
    <PreviewSessionProvider me={ME}>
      <View style={{ flex: 1 }}>
        {v === 'home' ? <CallScreen /> : <Static v={v} />}
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

function Static({ v }: { v: Exclude<V, 'home'> }) {
  useGlow(GLOW[v]);
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
