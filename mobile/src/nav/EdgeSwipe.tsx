import { BlurMask, Canvas, DiffRect, Group, LinearGradient, rect, rrect, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { interpolateColor, runOnJS, useDerivedValue, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { radius } from '@/theme/tokens';

/**
 * The menu opens with a swipe in from the right edge (there's no menu button). While the
 * finger drags, light gathers along the right border: blue as it starts, deepening into the
 * brand blue and violet once letting go would open the menu (with a tap of haptics there).
 * The light follows the screen's rounded corners, like the edge glow it belongs to.
 * The glow canvas stays mounted at rest; only its values change.
 */

/** How far to drag (pt) before letting go opens the menu. */
const OPEN_AT = 90;
/** The strip along the right edge where the swipe can start. Swipeable rows leave it alone. */
export const EDGE_WIDTH = 24;

export function EdgeSwipe({ enabled, onOpen, progress, children }: { enabled: boolean; onOpen: () => void; progress: SharedValue<number>; children: ReactNode }) {
  const armed = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(enabled)
    .hitSlop({ right: 0, width: EDGE_WIDTH })
    .activeOffsetX(-10)
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      progress.value = Math.max(0, Math.min(1.4, -e.translationX / OPEN_AT));
      const ready = progress.value >= 1;
      if (ready !== armed.value) {
        armed.value = ready;
        if (ready) runOnJS(haptic.edgeReady)();
      }
    })
    .onEnd((e) => {
      const open = progress.value >= 1 || (e.velocityX < -700 && progress.value > 0.3);
      progress.value = withTiming(0, { duration: open ? 350 : 220 });
      armed.value = false;
      if (open) runOnJS(onOpen)();
    })
    .onFinalize(() => {
      if (progress.value > 0 && !armed.value) progress.value = withTiming(0, { duration: 220 });
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
        <EdgeGlowCue progress={progress} />
      </View>
    </GestureDetector>
  );
}

/** A soft peek of the cue, to show where the menu lives. */
export function peek(progress: SharedValue<number>) {
  progress.value = withSequence(withTiming(0.75, { duration: 450 }), withTiming(0, { duration: 650 }), withTiming(0.75, { duration: 450 }), withTiming(0, { duration: 650 }));
}

function EdgeGlowCue({ progress }: { progress: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const R = radius.device;
  // The screen's own shape: the light is clipped to it so the blur never squares off a corner.
  const screen = useMemo(() => rrect(rect(0, 0, width, height), R, R), [width, height, R]);
  const band = useDerivedValue(() => 6 + 46 * Math.min(1.4, progress.value));
  // A ring hugging the border, as wide as the band; only its right side is lit (see the gradient).
  const inner = useDerivedValue(() => {
    const b = band.value;
    const r = Math.max(0, R - b);
    return rrect(rect(b, b, width - b * 2, height - b * 2), r, r);
  });
  const opacity = useDerivedValue(() => Math.min(1, progress.value * 1.4));
  // The light fades out leftward, past the corner curves, so the top and bottom only catch its tail.
  const start = useDerivedValue(() => vec(width - Math.max(R, band.value) - band.value, 0));
  const colors = useDerivedValue(() => {
    const p = Math.min(1, progress.value);
    // Aura blue while dragging; brand blue into violet once it's ready to open.
    const edge = interpolateColor(p, [0, 0.99, 1], ['#5cc8ff', '#5cc8ff', '#2557e8']);
    const mid = interpolateColor(p, [0, 0.99, 1], ['rgba(92,200,255,0.35)', 'rgba(92,200,255,0.5)', 'rgba(181,156,255,0.7)']);
    return ['rgba(92,200,255,0)', mid, edge];
  });
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group clip={screen} opacity={opacity}>
        <DiffRect outer={screen} inner={inner}>
          <BlurMask blur={14} style="normal" />
          <LinearGradient start={start} end={vec(width, 0)} colors={colors} positions={[0, 0.55, 1]} />
        </DiffRect>
      </Group>
    </Canvas>
  );
}
