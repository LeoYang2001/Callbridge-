import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color } from '@/theme/tokens';

/** White card with the design's 1 px ring. */
export function Card({ children, style, tint }: { children: ReactNode; style?: ViewStyle; tint?: string }) {
  return <View style={[s.card, tint ? { backgroundColor: tint, borderColor: tint } : null, style]}>{children}</View>;
}

/** A label/value row inside a details card. */
export function DetailRow({ label, children, last }: { label: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.divider]}>
      <View style={s.label}>{label}</View>
      <View style={s.value}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.white, borderRadius: 20, borderWidth: 1, borderColor: color.divider, padding: 16, gap: 8 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  divider: { borderBottomWidth: 1, borderBottomColor: color.divider },
  label: { width: 96 },
  value: { flex: 1, alignItems: 'flex-end' },
});
