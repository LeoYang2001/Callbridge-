import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A screen over the edge glow: transparent, so the glow (drawn behind everything at the root)
 * shows at the edges. Pads for the status bar and home indicator.
 */
export function Screen({ children, scroll = false, top, bottom, padding = 24, style }: { children: ReactNode; scroll?: boolean; top?: ReactNode; bottom?: ReactNode; padding?: number; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[{ paddingHorizontal: padding, paddingBottom: 24, gap: 14 }, style]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: padding }, style]}>{children}</View>
  );
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {top}
      {body}
      {bottom}
    </View>
  );
}

/** The row under the status bar: left, center, right slots (e.g. Leave · name · —, or the menu button). */
export function TopBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.bar}>
      <View style={s.side}>{left}</View>
      <View style={s.center}>{center}</View>
      <View style={[s.side, s.right]}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 18 },
  side: { width: 80, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
});
