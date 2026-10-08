import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { displayPhone } from '@shared/phone';
import type { PlaceResult, ResearchResult } from '@shared/types';
import { color, font, type } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';

const VIOLET_RING = '#8b6cf0';
const STEPS = ['Understanding what you need', 'Searching the web and maps', 'Checking phone numbers', 'Picking the best fits'];

/** Looking it up: a radar while the research agent works, and its steps ticking off. */
export function Searching({ asked }: { asked?: string }) {
  const [step, setStep] = useState(0);
  // The research is one request; the steps pace themselves and the last waits for the answer.
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ gap: 14 }}>
      {asked ? <UserBubble text={asked} /> : null}
      <View style={s.radar}>
        {[0, 700, 1400].map((d) => (
          <Ping key={d} delay={d} />
        ))}
        <View style={s.disc}>
          <Icon name="search" size={22} color={color.white} />
        </View>
      </View>
      <View style={{ gap: 2, paddingHorizontal: 4 }}>
        {STEPS.map((label, i) => (
          <View key={label} style={[s.step, { opacity: i > step ? 0.4 : 1 }]}>
            <View style={s.stepIcon}>{i < step ? <Icon name="check" size={20} color={color.green} /> : i === step ? <Spinner /> : <View style={s.wait} />}</View>
            <Text style={[type.callout, { fontSize: 15, fontWeight: i === step ? '600' : '400' }]}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** What it found: the assistant's note and place cards to tap. */
export function Found({ result, onPick }: { result: ResearchResult; onPick: (p: PlaceResult) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Animated.View entering={FadeInUp.duration(350)} style={s.note}>
        <Text style={[type.callout, { fontSize: 15, lineHeight: 21 }]}>{result.answer}</Text>
      </Animated.View>
      {result.places.slice(0, 4).map((p, i) => (
        <Animated.View key={p.phone ?? p.name} entering={FadeInUp.duration(350).delay(80 * i)}>
          <Pressable onPress={() => onPick(p)} style={({ pressed }) => [s.place, pressed && { opacity: 0.7 }]}>
            <View style={s.placeHead}>
              <Text style={[type.bodyStrong, { fontSize: 15, flex: 1 }]} numberOfLines={1}>
                {p.name}
              </Text>
              {p.distanceMeters != null ? <Text style={type.caption}>{(p.distanceMeters / 1609).toFixed(1)} mi</Text> : null}
            </View>
            <Text style={type.caption} numberOfLines={1}>
              {[p.openNow === true ? 'Open now' : p.openNow === false ? 'Closed now' : null, p.rating ? `${p.rating} ★${p.ratingCount ? ` (${p.ratingCount})` : ''}` : null, p.inPhoneBookAs ? `In your phone book as ${p.inPhoneBookAs}` : null]
                .filter(Boolean)
                .join(' · ') || p.address}
            </Text>
            <View style={s.placeHead}>
              <Text style={{ fontFamily: font.mono, fontSize: 13.5, color: color.ink }}>{p.phone ? displayPhone(p.phone) : 'No number'}</Text>
              {!p.verified ? <Text style={s.unverified}>Unverified number</Text> : null}
            </View>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={s.user}>
      <Text style={[type.callout, { fontSize: 15, color: color.white, lineHeight: 21 }]}>{text}</Text>
    </View>
  );
}

function Ping({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2100, easing: Easing.out(Easing.ease) }), -1, false));
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.45 + 1.25 * v.value }], opacity: 0.7 * (1 - v.value) }));
  return <Animated.View style={[s.ring, style]} />;
}

function Spinner() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1, false);
  }, [v]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${v.value}deg` }] }));
  return <Animated.View style={[s.spinner, style]} />;
}

const s = StyleSheet.create({
  radar: { height: 150, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: VIOLET_RING },
  disc: { width: 58, height: 58, borderRadius: 29, backgroundColor: color.violet, alignItems: 'center', justifyContent: 'center', shadowColor: color.violet, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  stepIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  wait: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.lineStrong },
  spinner: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: '#e4dcff', borderTopColor: color.violet },
  note: { maxWidth: '92%', backgroundColor: color.surface, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 11 },
  place: { backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
  placeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  unverified: { ...type.caption, fontSize: 11.5, fontWeight: '600', color: color.amberText, backgroundColor: color.amberTint, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  user: { alignSelf: 'flex-end', maxWidth: '80%', backgroundColor: color.blue, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6 },
});
