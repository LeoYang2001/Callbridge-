import { StyleSheet, Text, View } from 'react-native';
import type { IntakeDraft } from '@shared/types';
import { color, type } from '@/theme/tokens';

/** The five things a call needs: who, the number, the goal, when, and limits. */
export function detailsKnown(d: IntakeDraft): number {
  return [
    Boolean(d.counterpartName),
    Boolean(d.phoneNumber),
    Boolean(d.task),
    Boolean(d.availability?.length || d.earliestDate || d.latestDate),
    d.maxAdditionalCostUsd !== undefined || Boolean(d.shareableInfo?.length),
  ].filter(Boolean).length;
}

/**
 * The request taking shape while the assistant asks: name, "n of 5 details", what it needs to
 * know. Sits at the top of the conversation, slim, so the middle is free for it.
 */
export function RequestCard({ draft, need }: { draft: IntakeDraft; need?: string }) {
  const n = detailsKnown(draft);
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={[type.bodyStrong, { fontSize: 15, flex: 1 }]} numberOfLines={1}>
          {draft.counterpartName || 'New call'}
        </Text>
        <Text style={[type.caption, { fontSize: 12 }]}>{n} of 5 details</Text>
      </View>
      <View style={s.segs}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[s.seg, { backgroundColor: i < n ? color.blue : color.line }]} />
        ))}
      </View>
      {draft.taskInUserLanguage || need ? (
        <Text style={type.caption} numberOfLines={1}>
          {draft.taskInUserLanguage}
          {draft.taskInUserLanguage && need ? ' · ' : ''}
          {need ? <Text style={{ color: color.violet }}>{need}</Text> : null}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 18, marginTop: 6, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segs: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
});
