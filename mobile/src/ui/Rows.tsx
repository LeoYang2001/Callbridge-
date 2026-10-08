import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, type } from '@/theme/tokens';
import { Icon } from './Icon';

/** A white rounded group of rows (settings, contact info). */
export function Group({ children }: { children: ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

/** One row: a label (with an optional second line) and a value, control, or chevron. */
export function Row({ label, sub, value, right, onPress, last }: { label: string; sub?: string; value?: string; right?: ReactNode; onPress?: () => void; last?: boolean }) {
  const body = (
    <View style={[s.row, !last && s.divider]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, { fontSize: 15 }]}>{label}</Text>
        {sub ? <Text style={[type.caption, { fontSize: 12.5 }]}>{sub}</Text> : null}
      </View>
      {value ? (
        <Text style={[type.callout, { fontSize: 15, color: color.secondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && !right ? <Icon name="chevron" size={12} color={color.tertiary} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={[type.label, { marginTop: 18, marginBottom: 8, marginLeft: 4 }]}>{children}</Text>;
}

const s = StyleSheet.create({
  group: { backgroundColor: color.white, borderRadius: 20, borderWidth: 1, borderColor: color.divider, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: color.divider },
});
