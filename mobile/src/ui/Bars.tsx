import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

/** Four little voice bars that bounce while someone is speaking (0.7 s, staggered). */
export function Bars({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center', height: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <Bar key={i} color={color} delay={i * 100} />
      ))}
    </View>
  );
}

function Bar({ color, delay }: { color: string; delay: number }) {
  const v = useSharedValue(0.35);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 350, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }] }));
  return <Animated.View style={[{ width: 2.5, height: 12, borderRadius: 2, backgroundColor: color }, style]} />;
}
