import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '@/theme/tokens';
import { EdgeGlow } from './EdgeGlow';
import type { GlowMode } from './modes';

/**
 * Screens say which glow they want with useGlow(mode); the root draws it. A screen that's
 * focused owns the glow, so going back restores the previous screen's mode. The glow is drawn
 * over everything (cards and sheets included), and touches pass through it.
 */

interface GlowState {
  mode: GlowMode;
  /** Hold countdown, 1 → 0 (the edge is the countdown). */
  holdFraction: number;
  /** An overlay that isn't part of the conversation (the menu) is up: no glow. */
  hidden: boolean;
}

const GlowContext = createContext<((s: Partial<GlowState>) => void) | null>(null);

export function GlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlowState>({ mode: 'none', holdFraction: 1, hidden: false });
  const set = useCallback((s: Partial<GlowState>) => setState((prev) => ({ ...prev, ...s })), []);
  return (
    <GlowContext.Provider value={set}>
      <View style={{ flex: 1, backgroundColor: color.white }}>
        {children}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
          <EdgeGlow mode={state.hidden ? 'none' : state.mode} holdFraction={state.holdFraction} />
        </View>
      </View>
    </GlowContext.Provider>
  );
}

/** Sets the glow while the calling screen is focused. */
export function useGlow(mode: GlowMode, holdFraction = 1) {
  const set = useContext(GlowContext);
  if (!set) throw new Error('useGlow must be used inside GlowProvider');
  useFocusEffect(
    useCallback(() => {
      set({ mode, holdFraction });
    }, [set, mode, holdFraction]),
  );
}

/** While an overlay that isn't a voice screen is up (the menu), the glow fades out; it comes back after. */
export function useHideGlow() {
  const set = useContext(GlowContext);
  if (!set) throw new Error('useHideGlow must be used inside GlowProvider');
  useEffect(() => {
    set({ hidden: true });
    return () => set({ hidden: false });
  }, [set]);
}

/** For overlays that aren't screens: set the glow directly. */
export function useSetGlow() {
  const set = useContext(GlowContext);
  if (!set) throw new Error('useSetGlow must be used inside GlowProvider');
  return set;
}
