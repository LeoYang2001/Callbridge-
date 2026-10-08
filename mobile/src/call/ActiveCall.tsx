import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CallRecord } from '@shared/types';
import { watchCall } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * The call in progress, app-wide: the menu's "Live" row and the in-app capsule follow it on
 * every screen. A screen that starts or opens a live call registers it with follow(id).
 */

const LIVE: CallRecord['status'][] = ['preparing', 'dialing', 'connected'];

interface ActiveCallApi {
  /** The call being followed (live, or just finished until dismissed). */
  call: CallRecord | null;
  live: boolean;
  follow: (callId: string) => void;
  dismiss: () => void;
}

const Ctx = createContext<ActiveCallApi>({ call: null, live: false, follow: () => {}, dismiss: () => {} });

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const conn = state.status === 'signedIn' ? state.conn : null;
  const [id, setId] = useState<string | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    stop.current?.();
    stop.current = null;
    if (!conn || !id) return setCall(null);
    stop.current = watchCall(conn, id, setCall, () => {});
    return () => stop.current?.();
  }, [conn, id]);

  const follow = useCallback((callId: string) => setId(callId), []);
  const dismiss = useCallback(() => setId(null), []);
  const live = call ? LIVE.includes(call.status) : false;
  return <Ctx.Provider value={{ call, live, follow, dismiss }}>{children}</Ctx.Provider>;
}

export const useActiveCall = () => useContext(Ctx);

/** Seconds since the other party answered (or since dialing), for the call timer. */
export function useCallSeconds(call: CallRecord | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!call) return 0;
  const from = call.metrics.answeredAt ?? call.metrics.dialedAt ?? call.createdAt;
  const to = call.metrics.endedAt ?? Date.now();
  return Math.max(0, Math.floor((to - from) / 1000));
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
