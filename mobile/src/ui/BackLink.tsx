import { router, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { color, type } from '@/theme/tokens';
import { Icon } from './Icon';

/** "‹ Me" in the top bar: back, or to `fallback` when there's nothing to go back to. */
export function BackLink({ fallback, label = 'Back' }: { fallback: Href; label?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon name="back" size={14} color={color.blue} />
      <Text style={[type.small, { color: color.blue, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
