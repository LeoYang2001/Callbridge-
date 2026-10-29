import type { AuthResult, Me, PublicConfig, TranslatedCallRecord, TranslatedCallRequest, TranslatedCallSummary } from '../types';

/**
 * The CallBridge server API, shared by the web app and the mobile app. Nothing here touches the
 * DOM or React Native: just fetch, so both can import it as is.
 */

export interface Connection {
  /** Base URL of the CallBridge server, e.g. https://callbridge.byte2bite.tech. Empty = same origin (web only). */
  serverUrl: string;
  /** Sign-in session from verifying a code sent to the user's phone. Empty when signed out. */
  sessionToken: string;
}

export const endpoint = (s: Connection, path: string) => `${s.serverUrl.trim().replace(/\/+$/, '')}${path}`;

function headers(s: Connection, extra: Record<string, string> = {}) {
  return {
    ...extra,
    // Lets requests through ngrok's free-tier browser interstitial.
    'ngrok-skip-browser-warning': '1',
    ...(s.sessionToken ? { Authorization: `Bearer ${s.sessionToken}` } : {}),
  };
}

/** AbortSignal.timeout, which not every JS runtime has. */
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** Called when the server no longer accepts the session (the app shows the sign-in screen). */
let onSignedOut: (() => void) | undefined;
export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

async function request<T>(s: Connection, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(endpoint(s, path), { ...init, headers: headers(s, init.headers as Record<string, string>) });
  } catch {
    throw new Error(`Can't reach the server${s.serverUrl ? ` at ${s.serverUrl}` : ''}. Check your connection and that the server is running.`);
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    onSignedOut?.();
    throw new Error('Your sign-in expired. Sign in again.');
  }
  return json<T>(res);
}

const send = <T>(s: Connection, method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown) =>
  request<T>(s, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const postJson = <T>(s: Connection, path: string, body: unknown) => send<T>(s, 'POST', path, body);

export const getConfig = (s: Connection) => request<PublicConfig>(s, '/api/config');

// ── sign-in and profile ──
export const startSignIn = (s: Connection, phone: string) => postJson<{ ok: boolean; channel: 'sms' | 'log' }>(s, '/api/auth/start', { phone });
export const verifySignIn = (s: Connection, body: { phone: string; code: string; language: string; timezone: string }) =>
  postJson<AuthResult>(s, '/api/auth/verify', body);
export const signOut = (s: Connection) => postJson<{ ok: boolean }>(s, '/api/auth/logout', {});
export const getMe = (s: Connection) => request<Me>(s, '/api/me');
export const updateProfile = (s: Connection, patch: Record<string, unknown>) => send<Me>(s, 'PATCH', '/api/me/profile', patch);
export const saveContact = (s: Connection, contact: { name: string; phone: string; relationship?: string; language?: string; address?: string }, id?: string) =>
  send<Me>(s, id ? 'PATCH' : 'POST', id ? `/api/me/contacts/${id}` : '/api/me/contacts', contact);
export const deleteContact = (s: Connection, id: string) => request<Me>(s, `/api/me/contacts/${id}`, { method: 'DELETE' });
export const deleteAccount = (s: Connection) => request<{ ok: boolean }>(s, '/api/me', { method: 'DELETE' });

/** One poll may take at most this long; a request frozen while the app was in the background is dropped. */
const POLL_TIMEOUT_MS = 8000;

// ── translated calls: the user talks; captions and an optional AI interpreter ──
export const startTranslatedCall = (s: Connection, req: TranslatedCallRequest) =>
  postJson<{ record: TranslatedCallRecord; join?: { token: string; callId: string; code: string } }>(s, '/api/translated-calls', req);
export const getTranslatedCall = (s: Connection, id: string) => request<TranslatedCallRecord>(s, `/api/translated-calls/${id}`);
export const setCaptions = (s: Connection, id: string, on: boolean) => postJson<{ ok: boolean }>(s, `/api/translated-calls/${id}/captions`, { on });
export const setInterpreter = (s: Connection, id: string, on: boolean) => postJson<{ ok: boolean }>(s, `/api/translated-calls/${id}/interpreter`, { on });
export const askConsent = (s: Connection, id: string) => postJson<{ ok: boolean }>(s, `/api/translated-calls/${id}/ask`, {});
export const hangUpTranslatedCall = (s: Connection, id: string) => postJson<{ ok: boolean }>(s, `/api/translated-calls/${id}/hangup`, {});

/** Polls a translated call until it ends; captions change quickly, so it polls more often than assistant calls. */
export function watchTranslatedCall(s: Connection, id: string, onUpdate: (r: TranslatedCallRecord) => void, onError: (msg: string) => void) {
  let stopped = false;
  let failures = 0;
  let next: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await request<TranslatedCallRecord>(s, `/api/translated-calls/${id}`, { signal: timeoutSignal(POLL_TIMEOUT_MS) });
      failures = 0;
      if (stopped) return;
      onUpdate(r);
      if (r.status === 'ended' || r.status === 'failed') return;
    } catch (e) {
      if (++failures === 5) onError((e as Error).message);
    }
    if (!stopped) next = setTimeout(tick, failures ? 3000 : 600);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(next);
  };
}

export const listTranslatedCalls = (s: Connection) => request<TranslatedCallSummary[]>(s, '/api/translated-calls');
export const deleteTranslatedCall = (s: Connection, id: string) => request<{ ok: boolean }>(s, `/api/translated-calls/${id}`, { method: 'DELETE' });

/** Calling from your own number: start verifying it (Twilio calls you; type the code shown). */
export const startCallerId = (s: Connection) => postJson<{ verified: boolean; enabled?: boolean; validationCode?: string }>(s, '/api/me/caller-id', {});
/** Whether your number is verified as a caller ID yet (and switched on). */
export const callerIdStatus = (s: Connection) => request<{ verified: boolean; enabled: boolean }>(s, '/api/me/caller-id');
