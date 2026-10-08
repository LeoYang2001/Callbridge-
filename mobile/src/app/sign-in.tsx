import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useGlow } from '@/glow/GlowContext';
import { useSignIn } from '@/hooks/useSignIn';
import { color, font, type } from '@/theme/tokens';
import { PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';

/** Sign in with a phone number, then the 6-digit code. No glow: nothing is happening yet. */
export default function SignIn() {
  useGlow('none');
  const f = useSignIn();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen padding={28}>{f.step === 'phone' ? <PhoneStep f={f} /> : <CodeStep f={f} />}</Screen>
    </KeyboardAvoidingView>
  );
}

type Form = ReturnType<typeof useSignIn>;

function PhoneStep({ f }: { f: Form }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={s.hero}>
        <View style={s.brand}>
          <View style={s.mark}>
            <Icon name="phone" size={18} color={color.white} />
          </View>
          <Text style={[type.h3, { fontSize: 18 }]}>CallBridge</Text>
        </View>
        <Text style={type.hero}>{'Call anyone,\nin your language.'}</Text>
        <Text style={type.sub}>An AI assistant makes the call for you and checks with you before deciding anything. You'll pick your language next.</Text>
      </View>
      <Text style={[type.caption, { fontWeight: '600', marginBottom: 8 }]}>Your phone number</Text>
      <View style={s.field}>
        <Text style={[type.mono, { color: color.secondary }]}>+1 </Text>
        <TextInput
          value={f.phone}
          onChangeText={f.setPhone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="(901)-555-0199"
          placeholderTextColor={color.tertiary}
          style={[type.mono, { flex: 1 }]}
          returnKeyType="done"
          onSubmitEditing={() => f.phoneComplete && f.sendCode()}
        />
      </View>
      <Text style={[type.caption, { fontSize: 12.5, marginTop: 8, marginBottom: 18 }]}>We'll text you a 6-digit code.</Text>
      {f.error ? <Text style={[type.small, { color: color.redText, marginBottom: 10 }]}>{f.error}</Text> : null}
      <PillButton title="Continue" onPress={f.sendCode} disabled={!f.phoneComplete} busy={f.busy} />
      {__DEV__ && (
        <Text style={[type.caption, { textAlign: 'center', marginTop: 14 }]} onPress={() => router.push('/dev/glow')}>
          Glow gallery (dev)
        </Text>
      )}
    </View>
  );
}

const RESEND_S = 30;

function CodeStep({ f }: { f: Form }) {
  const input = useRef<TextInput>(null);
  const [wait, setWait] = useState(RESEND_S);
  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  // Six digits in (typed or filled in from Messages): sign in.
  useEffect(() => {
    if (f.code.length === 6 && !f.busy) void f.verify();
    // Only when the code changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.code]);

  return (
    <View style={{ flex: 1, paddingTop: 30, gap: 10 }}>
      <Pressable onPress={f.changeNumber} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Icon name="back" size={14} color={color.blue} />
        <Text style={[type.small, { color: color.blue }]}>Change number</Text>
      </Pressable>
      <Text style={type.title}>Enter the code</Text>
      <Text style={type.small}>Sent to +1 {f.phone}</Text>
      <Pressable onPress={() => input.current?.focus()} style={s.boxes}>
        {Array.from({ length: 6 }, (_, i) => {
          const active = i === Math.min(f.code.length, 5);
          return (
            <View key={i} style={[s.box, active && s.boxActive]}>
              <Text style={[type.mono, { fontSize: 26, fontWeight: '600' }]}>{f.code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      {/* One hidden field behind the boxes: it takes the code from Messages (oneTimeCode). */}
      <TextInput
        ref={input}
        value={f.code}
        onChangeText={f.setCode}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={6}
        style={s.hidden}
      />
      {f.error ? <Text style={[type.small, { color: color.redText }]}>{f.error}</Text> : null}
      <Text style={[type.caption, { marginTop: 8 }]}>
        {f.busy ? 'Checking…' : 'Filled in from your messages · '}
        {!f.busy &&
          (wait > 0 ? (
            `Resend in 0:${String(wait).padStart(2, '0')}`
          ) : (
            <Text
              style={{ color: color.blue, fontWeight: '600' }}
              onPress={() => {
                setWait(RESEND_S);
                void f.sendCode();
              }}
            >
              Resend code
            </Text>
          ))}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { flex: 1, justifyContent: 'center', gap: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 36, height: 36, borderRadius: 11, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' },
  field: { height: 56, borderRadius: 18, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 20 },
  box: { flex: 1, height: 60, borderRadius: 14, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderWidth: 2, borderColor: color.blue },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1, fontFamily: font.mono },
});
