import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResult, Me } from '@shared/types';
import { getMe, setSignedOutHandler, signOut as serverSignOut, type Connection } from './api';
import { SERVER_URL } from './config';
import { unregisterForPush } from './push';

/**
 * The signed-in user. The session token lives in the iOS Keychain / Android Keystore (expo-secure-
 * store), never in plain storage. Any 401 from the server signs the app out.
 */

const TOKEN_KEY = 'callbridge.session';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; me: Me; conn: Connection };

interface SessionApi {
  state: SessionState;
  /** The server connection, signed in or not (sign-in requests need no token). */
  conn: Connection;
  signedIn: (result: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  /** Replace the profile after the server returned an updated one. */
  setMe: (me: Me) => void;
  refreshMe: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

/** The language and time zone sign-up starts with; the profile interview can change both. */
export function deviceLocale() {
  const locale = Localization.getLocales()[0];
  const calendar = Localization.getCalendars()[0];
  return { languageTag: locale?.languageTag ?? 'en-US', timezone: calendar?.timeZone ?? 'America/Chicago' };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const clear = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    setState({ status: 'signedOut' });
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => void clear());
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (!token) return setState({ status: 'signedOut' });
      const conn = { serverUrl: SERVER_URL, sessionToken: token };
      try {
        setState({ status: 'signedIn', me: await getMe(conn), conn });
      } catch {
        // Offline at launch: a 401 has already signed out; otherwise try again later.
        setState((s) => (s.status === 'loading' ? { status: 'signedOut' } : s));
      }
    })();
  }, [clear]);

  const api = useMemo<SessionApi>(() => {
    const conn = state.status === 'signedIn' ? state.conn : { serverUrl: SERVER_URL, sessionToken: '' };
    return {
      state,
      conn,
      signedIn: async (r) => {
        await SecureStore.setItemAsync(TOKEN_KEY, r.token);
        setState({ status: 'signedIn', me: r.me, conn: { serverUrl: SERVER_URL, sessionToken: r.token } });
      },
      signOut: async () => {
        if (state.status === 'signedIn') {
          await unregisterForPush(state.conn);
          await serverSignOut(state.conn).catch(() => {});
        }
        await clear();
      },
      setMe: (me) => setState((s) => (s.status === 'signedIn' ? { ...s, me } : s)),
      refreshMe: async () => {
        if (state.status !== 'signedIn') return;
        const me = await getMe(state.conn);
        setState((s) => (s.status === 'signedIn' ? { ...s, me } : s));
      },
    };
  }, [state, clear]);

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

/**
 * Development only: a signed-in session with sample data and no server, so screens can be
 * previewed without signing in (see app/dev/preview.tsx).
 */
export function PreviewSessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const conn = { serverUrl: 'https://preview.invalid', sessionToken: 'preview' };
  const api: SessionApi = {
    state: { status: 'signedIn', me, conn },
    conn,
    signedIn: async () => {},
    signOut: async () => {},
    setMe: () => {},
    refreshMe: async () => {},
  };
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The signed-in user and connection; only for screens behind the sign-in guard. */
export function useSignedIn() {
  const { state, ...rest } = useSession();
  if (state.status !== 'signedIn') throw new Error('Not signed in');
  return { ...rest, me: state.me, conn: state.conn };
}
