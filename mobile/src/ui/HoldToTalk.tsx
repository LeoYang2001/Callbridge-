import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { color, type } from '@/theme/tokens';
import { Icon } from './Icon';
import { useToast } from './Toast';

/** Shorter than this, a press is a tap, not speech. */
const MIN_HOLD_MS = 350;

/**
 * Push-to-talk: the assistant listens only while this is held. 84 pt (104 on Home), brand blue;
 * pressed it grows to 1.12 with two soft rings, and the label says "Release to send".
 */
export function HoldToTalk({
  holding,
  onPressIn,
  onRelease,
  size = 84,
  label = 'Hold to talk',
  disabled,
}: {
  holding: boolean;
  onPressIn: () => void;
  /** tooShort: it was a tap; the turn should be dropped. */
  onRelease: (tooShort: boolean) => void;
  size?: number;
  label?: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const downAt = useRef(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(holding ? 1.12 : 1, { duration: 180 }) }],
    backgroundColor: withTiming(holding ? color.bluePressed : color.blue, { duration: 200 }),
  }));
  const rings = useAnimatedStyle(() => ({ opacity: withTiming(holding ? 1 : 0, { duration: 250 }) }));

  return (
    <View style={s.wrap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View pointerEvents="none" style={[s.ring, { width: size + 60, height: size + 60, borderRadius: (size + 60) / 2, backgroundColor: 'rgba(37,87,232,0.07)' }, rings]} />
        <Animated.View pointerEvents="none" style={[s.ring, { width: size + 28, height: size + 28, borderRadius: (size + 28) / 2, backgroundColor: 'rgba(37,87,232,0.18)' }, rings]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Hold while you speak, release to send"
          disabled={disabled}
          onPressIn={() => {
            downAt.current = Date.now();
            haptic.talkDown();
            onPressIn();
          }}
          onPressOut={() => {
            const tooShort = Date.now() - downAt.current < MIN_HOLD_MS;
            if (tooShort) toast('Hold the button while you speak');
            else haptic.talkUp();
            onRelease(tooShort);
          }}
        >
          <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, s.shadow, style, disabled && { opacity: 0.5 }]}>
            <Icon name="mic" size={size * 0.34} color={color.white} />
          </Animated.View>
        </Pressable>
      </View>
      <Text style={[type.small, { color: color.blue, fontWeight: '600' }]}>{holding ? 'Release to send' : label}</Text>
    </View>
  );
}

/** "Mic on" with a red dot while holding; "Mic off" otherwise. */
export function MicState({ on }: { on: boolean }) {
  return (
    <View style={s.mic}>
      <View style={[s.dot, { backgroundColor: on ? color.red : color.lineStrong }]} />
      <Text style={type.caption}>{on ? 'Mic on' : 'Mic off'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  ring: { position: 'absolute' },
  shadow: { shadowColor: color.blue, shadowOpacity: 0.28, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } },
  mic: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
