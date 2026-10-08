import { Pressable, StyleSheet, View } from 'react-native';
import { color } from '@/theme/tokens';
import { useMenu } from './Menu';

/** 40 pt round button, top right of top-level screens: a long line over a short one. */
export function MenuButton() {
  const { open } = useMenu();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Menu" onPress={open} hitSlop={8} style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]}>
      <View style={[s.line, { width: 16 }]} />
      <View style={[s.line, { width: 9, alignSelf: 'flex-end', marginRight: 12 }]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.menuButton, justifyContent: 'center', alignItems: 'center', gap: 4 },
  line: { height: 2, borderRadius: 1, backgroundColor: color.ink },
});
