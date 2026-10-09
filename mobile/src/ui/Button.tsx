import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { color, type } from '@/theme/tokens';

type Kind = 'black' | 'blue' | 'green' | 'red' | 'amber' | 'white' | 'ghost';

const BG: Record<Kind, string> = {
  black: color.ink,
  blue: color.blue,
  green: color.green,
  red: color.red,
  amber: color.amber,
  white: color.white,
  ghost: 'transparent',
};

/** The design's pill buttons (height/2 radius): 56 pt black "Continue", 58 green "Call now", etc. */
export function PillButton({
  title,
  onPress,
  kind = 'black',
  height = 56,
  disabled,
  busy,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: Kind;
  height?: number;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const light = kind === 'white' || kind === 'ghost';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={() => {
        (kind === 'green' || kind === 'red' || kind === 'amber' ? haptic.commit : haptic.tap)();
        onPress();
      }}
      style={({ pressed }) => [
        s.pill,
        { height, borderRadius: height / 2, backgroundColor: BG[kind] },
        kind === 'white' && s.ring,
        (disabled || busy) && s.disabled,
        pressed && s.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={light ? color.ink : color.white} />
      ) : (
        <View style={s.row}>
          {icon}
          <Text style={[type.bodyStrong, { color: light ? color.ink : color.white }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A tappable answer chip (44 pt, white, 1 px ring) or a suggestion chip (38 pt, grey). */
export function Chip({ title, onPress, variant = 'answer', selected }: { title: string; onPress: () => void; variant?: 'answer' | 'suggestion' | 'blue'; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        variant === 'suggestion' ? s.suggestion : s.answer,
        variant === 'blue' && s.blueChip,
        selected && s.chipOn,
        pressed && s.pressed,
      ]}
    >
      <Text numberOfLines={variant === 'suggestion' ? 1 : undefined} style={[variant === 'suggestion' ? type.small : type.callout, variant === 'suggestion' && { color: color.ink }, variant === 'blue' && { color: color.white }]}>{title}</Text>
    </Pressable>
  );
}

/** A round icon button (Listen, Message, the menu button). */
export function RoundButton({ onPress, size = 56, bg = color.white, children, label, ring = true }: { onPress: () => void; size?: number; bg?: string; children: ReactNode; label: string; ring?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        (bg === color.red || bg === color.green ? haptic.commit : haptic.tap)();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, ring && s.ring, pressed && s.pressed]}
    >
      {children}
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ring: { borderWidth: 1, borderColor: color.line },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  answer: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  suggestion: { minHeight: 38, maxWidth: '100%', paddingHorizontal: 16, borderRadius: 19, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  blueChip: { backgroundColor: color.blue, borderColor: color.blue },
  chipOn: { borderWidth: 2, borderColor: color.blue },
});
