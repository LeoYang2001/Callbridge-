import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useGlow } from '@/glow/GlowContext';
import { useSession } from '@/lib/session';
import type { GlowMode } from '@/glow/modes';
import { type } from '@/theme/tokens';
import { Chip, PillButton } from '@/ui/Button';
import { Screen } from '@/ui/Screen';

const MODES: GlowMode[] = ['idle', 'listen', 'speak', 'think', 'search', 'ready', 'ring', 'hair', 'msg', 'hold', 'done', 'fail', 'none'];

/** Development only: every edge-glow mode, to compare with the prototype. */
export default function GlowGallery() {
  const signedIn = useSession().state.status === 'signedIn';
  const [mode, setMode] = useState<GlowMode>('idle');
  const [left, setLeft] = useState(30);
  useEffect(() => {
    if (mode !== 'hold') return;
    setLeft(30);
    const t = setInterval(() => setLeft((s) => (s <= 0 ? 30 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [mode]);
  useGlow(mode, left / 30);
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <Text style={type.title}>{mode}</Text>
        {mode === 'hold' && <Text style={type.sub}>{left}s left</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MODES.map((m) => (
            <Chip key={m} title={m} selected={m === mode} onPress={() => setMode(m)} />
          ))}
        </View>
      </View>
      <PillButton title="Back" kind="white" onPress={() => (router.canGoBack() ? router.back() : router.replace(signedIn ? '/' : '/sign-in'))} />
    </Screen>
  );
}
