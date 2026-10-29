import { useSyncExternalStore } from 'react';

/**
 * The call in progress, if any: set by the call screen while the call runs, so the menu can
 * offer a way back to it and app updates wait until it ends.
 */
export interface LiveCall {
  id: string;
  name: string;
  answeredAt?: number;
}

let current: LiveCall | null = null;
const listeners = new Set<() => void>();

export function setLiveCall(call: LiveCall | null) {
  if (call?.id === current?.id && call?.answeredAt === current?.answeredAt) return;
  current = call;
  listeners.forEach((l) => l());
}

export function useLiveCall(): LiveCall | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
