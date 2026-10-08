import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import type { CallRequest, RealtimeVoice } from '@shared/types';
import { REALTIME_VOICES } from '@shared/types';

export type Involvement = NonNullable<CallRequest['involvement']>;

const KEY = 'callbridge.prefs.v1';

interface Prefs {
  /** Stay in the loop (the assistant may hold the line to ask) or hand the call off; the last choice is the default. */
  involvement: Involvement;
  /** The voice picked on this phone; falls back to the profile's, then the server default. */
  voice: RealtimeVoice | null;
}

/** Small per-phone choices, remembered between launches and shared by every screen. */
let prefs: Prefs = { involvement: 'supervised', voice: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

SecureStore.getItemAsync(KEY)
  .then((raw) => {
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<Prefs>;
    prefs = {
      involvement: p.involvement === 'handoff' ? 'handoff' : 'supervised',
      voice: p.voice && (REALTIME_VOICES as readonly string[]).includes(p.voice) ? p.voice : null,
    };
    emit();
  })
  .catch(() => {});

function update(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  void SecureStore.setItemAsync(KEY, JSON.stringify(prefs)).catch(() => {});
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePreferences() {
  const current = useSyncExternalStore(subscribe, () => prefs);
  return {
    ...current,
    setInvolvement: (involvement: Involvement) => update({ involvement }),
    setVoice: (voice: RealtimeVoice) => update({ voice }),
  };
}
