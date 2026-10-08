import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { color, tag, type, type TagName } from '@/theme/tokens';

/** Uppercase section label (12/600, +0.08em), optionally colored. */
export function Label({ children, tint, style }: { children: ReactNode; tint?: string; style?: TextStyle }) {
  return <Text style={[type.label, tint ? { color: tint } : null, style]}>{children}</Text>;
}

/** A line in the user's language with its English underneath (hidden when the user speaks English). */
export function Bilingual({ text, english, textStyle, englishStyle }: { text: string; english?: string; textStyle: TextStyle; englishStyle?: TextStyle }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={textStyle}>{text}</Text>
      {english && english !== text ? <Text style={englishStyle ?? type.small}>{english}</Text> : null}
    </View>
  );
}

/** Status pill: Booked, No answer, Delivered, Not booked… */
export function StatusPill({ name }: { name: TagName }) {
  const c = tag[name];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[type.caption, { color: c.fg, fontWeight: '600' }]}>{name}</Text>
    </View>
  );
}

/** A small rounded pill for relationships, prices, languages. */
export function Pill({ children, bg = color.surface, fg = color.ink }: { children: ReactNode; bg?: string; fg?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[type.caption, { color: fg, fontWeight: '500' }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
});
