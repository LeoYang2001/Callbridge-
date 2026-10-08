import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { color } from '@/theme/tokens';
import { useMenu } from './Menu';

/**
 * The menu opens with a swipe from the right edge, so there's no visible menu button. This one
 * appears only with VoiceOver on, where edge swipes aren't practical.
 */
export function MenuButton() {
  const { open } = useMenu();
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);
  if (!screenReader) return null;
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
