import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, type } from '@/theme/tokens';

/** Two or three options in one rounded track (Stay in the loop | Hand it off). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.track} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={[s.seg, on && s.on]}>
            <Text style={[type.small, { color: on ? color.ink : color.secondary, fontWeight: on ? '600' : '500' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: 14, padding: 3 },
  seg: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: color.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
});
