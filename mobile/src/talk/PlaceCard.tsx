import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import type { PlaceResult } from '@shared/types';
import { openDirections } from '@/lib/afterCall';
import { haptic } from '@/lib/haptics';
import { color, font, type } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';

/**
 * A place from a search, laid out like a Google Maps result: photo, name, rating, kind of place,
 * price and distance, whether it's open and until when, the number, and Call / Directions. The
 * week's hours open underneath when Google has them.
 */

export const PLACE_CARD_WIDTH = 286;

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const weekday = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short' });

/** "Open · Closes 9:00 PM", "Closed · Opens 8:00 AM Sat", or the hours a web page gave. */
export function hoursLine(p: PlaceResult): { status?: string; open?: boolean; detail?: string } {
  if (p.openNow === true) return { status: 'Open', open: true, detail: p.closesAt ? `Closes ${time(p.closesAt)}` : p.hoursText };
  if (p.openNow === false) return { status: 'Closed', open: false, detail: p.opensAt ? `Opens ${time(p.opensAt)}${sameDay(p.opensAt) ? '' : ` ${weekday(p.opensAt)}`}` : p.hoursText };
  return { detail: p.hoursText };
}

export function PlaceCard({ place: p, onCall }: { place: PlaceResult; onCall: () => void }) {
  const [hours, setHours] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const h = hoursLine(p);
  const facts = [
    p.category,
    p.priceLevel ? '$'.repeat(p.priceLevel) : null,
    p.distanceMeters != null ? `${(p.distanceMeters / 1609).toFixed(1)} mi` : null,
  ].filter(Boolean);

  return (
    <View style={s.card}>
      {p.photoUrl && !photoFailed ? (
        <Image source={{ uri: p.photoUrl }} style={s.photo} resizeMode="cover" onError={() => setPhotoFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[s.photo, s.noPhoto]}>
          <Icon name="store" size={26} color={color.tertiary} />
        </View>
      )}
      <View style={s.body}>
        <Text style={[type.bodyStrong, { fontSize: 16 }]} numberOfLines={1}>
          {p.name}
        </Text>
        {p.rating ? (
          <View style={s.row}>
            <Text style={[type.caption, { color: color.ink, fontWeight: '600' }]}>{p.rating.toFixed(1)}</Text>
            <Stars rating={p.rating} />
            {p.ratingCount ? <Text style={type.caption}>({p.ratingCount.toLocaleString()})</Text> : null}
          </View>
        ) : null}
        {facts.length ? (
          <Text style={type.caption} numberOfLines={1}>
            {facts.join(' · ')}
          </Text>
        ) : null}
        {h.status || h.detail ? (
          <Pressable disabled={!p.weekHours?.length} onPress={() => (haptic.select(), setHours(!hours))} style={s.row} hitSlop={6}>
            {h.status ? <Text style={[type.caption, { fontWeight: '600', color: h.open ? color.greenText : color.redText }]}>{h.status}</Text> : null}
            {h.status && h.detail ? <Text style={type.caption}>·</Text> : null}
            {h.detail ? (
              <Text style={[type.caption, { flexShrink: 1 }]} numberOfLines={1}>
                {h.detail}
              </Text>
            ) : null}
            {p.weekHours?.length ? <Text style={[type.caption, { color: color.blue }]}>{hours ? 'Hide' : 'Hours'}</Text> : null}
          </Pressable>
        ) : null}
        {hours && p.weekHours ? (
          <View style={{ gap: 1, paddingVertical: 2 }}>
            {p.weekHours.map((d) => (
              <Text key={d} style={[type.caption, { fontSize: 12 }]} numberOfLines={1}>
                {d}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={s.row}>
          <Text style={{ fontFamily: font.mono, fontSize: 13, color: color.ink }}>{p.phone ? displayPhone(p.phone) : 'No number'}</Text>
          {!p.verified ? <Text style={s.unverified}>Unverified</Text> : null}
        </View>
        {p.inPhoneBookAs ? (
          <Text style={[type.caption, { color: color.blue }]} numberOfLines={1}>
            In your phone book as {p.inPhoneBookAs}
          </Text>
        ) : null}
        <View style={[s.row, { marginTop: 6, gap: 8 }]}>
          <Pressable accessibilityRole="button" onPress={() => (haptic.tap(), onCall())} style={({ pressed }) => [s.action, s.call, pressed && s.pressed]}>
            <Icon name="phone" size={15} color={color.white} />
            <Text style={[type.caption, { color: color.white, fontWeight: '600' }]}>Call</Text>
          </Pressable>
          {p.address || p.name ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => (haptic.tap(), void openDirections(p.address ? `${p.name}, ${p.address}` : p.name))}
              style={({ pressed }) => [s.action, s.secondary, pressed && s.pressed]}
            >
              <Icon name="directions" size={15} color={color.blue} />
              <Text style={[type.caption, { color: color.blue, fontWeight: '600' }]}>Directions</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${rating} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={11} color={rating >= i - 0.25 ? '#f5a623' : color.lineStrong} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: PLACE_CARD_WIDTH, backgroundColor: color.white, borderRadius: 20, borderWidth: 1, borderColor: color.line, overflow: 'hidden' },
  photo: { width: '100%', height: 116, backgroundColor: color.surface },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17 },
  call: { backgroundColor: color.blue },
  secondary: { backgroundColor: color.blueTint },
  pressed: { opacity: 0.75 },
  unverified: { ...type.caption, fontSize: 11, fontWeight: '600', color: color.amberText, backgroundColor: color.amberTint, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
});
