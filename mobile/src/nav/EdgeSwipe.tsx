import { BlurMask, Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { interpolateColor, runOnJS, useDerivedValue, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';

/**
 * The menu opens with a swipe in from the right edge (there's no menu button). While the
 * finger drags, light gathers along the right border: blue as it starts, deepening into the
 * brand blue and violet once letting go would open the menu (with a tap of haptics there).
 * The glow canvas stays mounted at rest; only its values change.
 */

/** How far to drag (pt) before letting go opens the menu. */
const OPEN_AT = 90;
/** The strip along the right edge where the swipe can start. */
const EDGE_WIDTH = 24;

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
  const band = useDerivedValue(() => 6 + 46 * Math.min(1.4, progress.value));
  const x = useDerivedValue(() => width - band.value);
  const opacity = useDerivedValue(() => Math.min(1, progress.value * 1.4));
  const start = useDerivedValue(() => vec(width - band.value, 0));
  const colors = useDerivedValue(() => {
    const p = Math.min(1, progress.value);
    // Aura blue while dragging; brand blue into violet once it's ready to open.
    const edge = interpolateColor(p, [0, 0.99, 1], ['#5cc8ff', '#5cc8ff', '#2557e8']);
    const mid = interpolateColor(p, [0, 0.99, 1], ['rgba(92,200,255,0.35)', 'rgba(92,200,255,0.5)', 'rgba(181,156,255,0.7)']);
    return ['rgba(92,200,255,0)', mid, edge];
  });
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={x} y={0} width={band} height={height} opacity={opacity}>
        <BlurMask blur={14} style="normal" />
        <LinearGradient start={start} end={vec(width, 0)} colors={colors} positions={[0, 0.55, 1]} />
      </Rect>
    </Canvas>
  );
}
