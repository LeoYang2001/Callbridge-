import type { IntakeContext } from '../intake';
import type {
  AuthResult,
  CallRecord,
  CallRequest,
  CallSummary,
  Errand,
  IntakeCheckResult,
  IntakeDraft,
  IntakeSession,
  Me,
  PublicConfig,
  ResearchResult,
  UserAnswer,
} from '../types';

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
export const research = (s: Connection, body: { question: string; depth: 'quick' | 'thorough'; lat?: number; lng?: number; near?: string; userLanguage?: string }, signal?: AbortSignal) =>
  request<ResearchResult>(s, '/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
/** Deletes a finished call from the history. */
export const deleteCall = (s: Connection, id: string) => request<{ ok: boolean }>(s, `/api/calls/${id}`, { method: 'DELETE' });
export const deleteAccount = (s: Connection) => request<{ ok: boolean }>(s, '/api/me', { method: 'DELETE' });

// ── push notifications (mobile app) ──
export const registerPushToken = (s: Connection, token: string, platform: 'ios' | 'android') =>
  postJson<{ ok: boolean }>(s, '/api/me/push-tokens', { token, platform });
export const removePushToken = (s: Connection, token: string) => send<{ ok: boolean }>(s, 'DELETE', '/api/me/push-tokens', { token });

// ── calls ──
export const startCall = (s: Connection, req: CallRequest) => postJson<CallRecord>(s, '/api/calls', req);
export const listCalls = (s: Connection) => request<CallSummary[]>(s, '/api/calls');
export const getCall = (s: Connection, id: string) => request<CallRecord>(s, `/api/calls/${id}`);

export const createIntakeSession = (s: Connection, context: IntakeContext & { followUpOf?: string; mode?: 'call' | 'profile'; pushToTalk?: boolean }) =>
  postJson<IntakeSession>(s, '/api/intake/session', context);

export const checkIntake = (s: Connection, context: IntakeContext, draft: IntakeDraft) =>
  postJson<IntakeCheckResult>(s, '/api/intake/check', { context, draft });

export const answerQuestion = (s: Connection, callId: string, questionId: string, answer: UserAnswer) =>
  postJson<{ ok: boolean }>(s, `/api/calls/${callId}/questions/${questionId}`, answer);

export const sendCallMessage = (s: Connection, callId: string, text: string) =>
  postJson<{ ok: boolean }>(s, `/api/calls/${callId}/messages`, { text });

export const listenTicket = (s: Connection, callId: string) => postJson<{ ticket: string }>(s, `/api/calls/${callId}/listen`, {});

export const endCall = (s: Connection, id: string) => postJson<{ ok: boolean }>(s, `/api/calls/${id}/hangup`, {});

/** One poll may take at most this long; a request frozen while the app was in the background is dropped. */
const POLL_TIMEOUT_MS = 8000;

/**
 * Polls the call until it finishes. Polling (rather than server-sent events) survives tunnels,
 * proxies and phones backgrounding the app. Answering the call on the same phone backgrounds the
 * app, so polls time out instead of hanging, and `onResume` (the page became visible, the app
 * came to the foreground) polls again right away.
 */
export function watchCall(
  s: Connection,
  id: string,
  onUpdate: (r: CallRecord) => void,
  onError: (msg: string) => void,
  onResume?: (poll: () => void) => () => void,
) {
  let stopped = false;
  let done = false;
  let inFlight = false;
  let failures = 0;
  let next: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped || done || inFlight) return;
    clearTimeout(next);
    inFlight = true;
    try {
      const r = await request<CallRecord>(s, `/api/calls/${id}`, { signal: timeoutSignal(POLL_TIMEOUT_MS) });
      failures = 0;
      if (stopped) return;
      onUpdate(r);
      if (r.status === 'completed' || r.status === 'failed') done = true;
    } catch (e) {
      // Keep trying while the call may still be going; only report a lasting problem.
      if (++failures === 5) onError((e as Error).message);
    } finally {
      inFlight = false;
    }
    if (!stopped && !done) next = setTimeout(tick, failures ? 3000 : 1000);
  };
  const unsubscribe = onResume?.(() => void tick());
  void tick();
  return () => {
    stopped = true;
    clearTimeout(next);
    unsubscribe?.();
  };
}

// ── errands: calls the server places later, on its own, one at a time ──
export const listErrands = (s: Connection) => request<Errand[]>(s, '/api/errands');
/** notBefore: don't call before this (ms since epoch); omit for as soon as calling hours allow. */
export const addErrand = (s: Connection, req: CallRequest, notBefore?: number) => postJson<Errand>(s, '/api/errands', { request: req, notBefore });
export const cancelErrand = (s: Connection, id: string) => postJson<Errand>(s, `/api/errands/${id}/cancel`, {});
export const retryErrand = (s: Connection, id: string) => postJson<Errand>(s, `/api/errands/${id}/retry`, {});

/** A few seconds of an assistant voice, in the user's language (WAV), to hear before picking it. */
export async function voiceSample(s: Connection, voice: string, language?: string): Promise<ArrayBuffer> {
  const q = language ? `?language=${encodeURIComponent(language)}` : '';
  const res = await fetch(endpoint(s, `/api/voices/${encodeURIComponent(voice)}/sample${q}`), { headers: headers(s), signal: timeoutSignal(20_000) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.arrayBuffer();
}

/** A finished call's recording (WAV), for replay with the transcript. */
export async function callRecording(s: Connection, id: string): Promise<ArrayBuffer> {
  const res = await fetch(endpoint(s, `/api/calls/${encodeURIComponent(id)}/recording`), { headers: headers(s), signal: timeoutSignal(30_000) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.arrayBuffer();
}
