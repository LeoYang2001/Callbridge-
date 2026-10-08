import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

/**
 * Placeholder building blocks, so every screen works before the designed UI exists. They carry
 * no design language on purpose: system font, system colors, plain layout. The designed
 * components replace these; the hooks in src/hooks don't change.
 */

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={s.screen}>{children}</View>;
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <Text style={s.title}>{children}</Text>;
export const Body = ({ children, muted }: { children: ReactNode; muted?: boolean }) => <Text style={[s.body, muted && s.muted]}>{children}</Text>;
export const Label = ({ children }: { children: ReactNode }) => <Text style={s.label}>{children}</Text>;
export const ErrorText = ({ children }: { children: ReactNode }) => (children ? <Text style={s.error}>{children}</Text> : null);

export function Button({ title, onPress, disabled, busy, kind = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean; kind?: 'primary' | 'plain' | 'danger' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.button, kind !== 'primary' && s.buttonPlain, (disabled || busy) && s.disabled, pressed && s.pressed]}
    >
      {busy ? <ActivityIndicator /> : <Text style={[s.buttonText, kind !== 'primary' && s.buttonTextPlain, kind === 'danger' && s.danger]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput style={s.input} placeholderTextColor="#888" {...props} />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

/** A choice between a few options (language, voice, involvement). */
export function Choice<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <View style={s.choices}>
      {options.map((o) => (
        <Pressable key={o} accessibilityRole="radio" accessibilityState={{ selected: o === value }} onPress={() => onChange(o)} style={[s.choice, o === value && s.choiceOn]}>
          <Text style={s.body}>{labels?.[o] ?? o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 16 },
  muted: { opacity: 0.6 },
  label: { fontSize: 13, opacity: 0.7 },
  error: { color: 'red', fontSize: 15 },
  button: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#007AFF' },
  buttonPlain: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: '#888' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  buttonTextPlain: { color: '#007AFF' },
  danger: { color: 'red' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  field: { gap: 4 },
  input: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: '#888', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#888', borderRadius: 8, padding: 12, gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#888', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  choiceOn: { borderColor: '#007AFF', borderWidth: 2 },
});
