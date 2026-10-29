import { Text, View } from 'react-native';
import { color, type } from '@/theme/tokens';

/** The mark: two speech shapes overlapping (indigo, the user; teal, the person they call). */
export function Brand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="header" accessibilityLabel="CallBridge">
      <View style={{ width: 28, height: 22 }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: 17, height: 13, borderRadius: 6.5, backgroundColor: color.blue }} />
        <View style={{ position: 'absolute', left: 10, top: 8, width: 17, height: 13, borderRadius: 6.5, backgroundColor: color.teal, opacity: 0.92 }} />
      </View>
      <Text style={[type.row, { fontWeight: '800', letterSpacing: -0.3 }]}>CallBridge</Text>
    </View>
  );
}

export function Avatar({ name, on, size = 40 }: { name: string; on?: boolean; size?: number }) {
  const letters =
    name
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '#';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: on ? color.blue : color.tealTint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: on ? color.white : color.teal, fontWeight: '800', fontSize: size * 0.34 }}>{letters}</Text>
    </View>
  );
}
