import type { IntakeContext } from '../../shared/intake';
import type { AuthResult, ResearchResult, CallRecord, CallRequest, IntakeCheckResult, IntakeDraft, IntakeSession, Me, PublicConfig, UserAnswer } from '../../shared/types';
import type { Settings } from './settings';

function endpoint(s: Settings, path: string) {
  return `${s.serverUrl.trim().replace(/\/+$/, '')}${path}`;
}

function headers(s: Settings, extra: Record<string, string> = {}) {
  return {
    ...extra,
    // Lets requests through ngrok's free-tier browser interstitial.
    'ngrok-skip-browser-warning': '1',
    ...(s.sessionToken ? { Authorization: `Bearer ${s.sessionToken}` } : {}),
  };
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

async function request<T>(s: Settings, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(endpoint(s, path), { ...init, headers: headers(s, init.headers as Record<string, string>) });
  } catch {
    throw new Error(`Can't reach the server${s.serverUrl ? ` at ${s.serverUrl}` : ''}. Check Settings and that the server is running.`);
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    onSignedOut?.();
    throw new Error('Your sign-in expired. Sign in again.');
  }
  return json<T>(res);
}

export const getConfig = (s: Settings) => request<PublicConfig>(s, '/api/config');

// ── sign-in and profile ──
export const startSignIn = (s: Settings, phone: string) => postJson<{ ok: boolean; channel: 'sms' | 'log' }>(s, '/api/auth/start', { phone });
export const verifySignIn = (s: Settings, body: { phone: string; code: string; language: string; timezone: string }) =>
  postJson<AuthResult>(s, '/api/auth/verify', body);
export const signOut = (s: Settings) => postJson<{ ok: boolean }>(s, '/api/auth/logout', {});
export const getMe = (s: Settings) => request<Me>(s, '/api/me');
export const updateProfile = (s: Settings, patch: Record<string, unknown>) =>
  request<Me>(s, '/api/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
export const saveContact = (s: Settings, contact: { name: string; phone: string; relationship?: string; language?: string }, id?: string) =>
  request<Me>(s, id ? `/api/me/contacts/${id}` : '/api/me/contacts', {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
export const deleteContact = (s: Settings, id: string) => request<Me>(s, `/api/me/contacts/${id}`, { method: 'DELETE' });
export const research = (s: Settings, body: { question: string; depth: 'quick' | 'thorough'; lat?: number; lng?: number; near?: string; userLanguage?: string }) =>
  postJson<ResearchResult>(s, '/api/research', body);
export const deleteAccount = (s: Settings) => request<{ ok: boolean }>(s, '/api/me', { method: 'DELETE' });

export const startCall = (s: Settings, req: CallRequest) =>
  request<CallRecord>(s, '/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

const postJson = <T>(s: Settings, path: string, body: unknown) =>
  request<T>(s, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const createIntakeSession = (s: Settings, context: IntakeContext & { followUpOf?: string; mode?: 'call' | 'profile' }) =>
  postJson<IntakeSession>(s, '/api/intake/session', context);

export const checkIntake = (s: Settings, context: IntakeContext, draft: IntakeDraft) =>
  postJson<IntakeCheckResult>(s, '/api/intake/check', { context, draft });

export const answerQuestion = (s: Settings, callId: string, questionId: string, answer: UserAnswer) =>
  postJson<{ ok: boolean }>(s, `/api/calls/${callId}/questions/${questionId}`, answer);

export const sendCallMessage = (s: Settings, callId: string, text: string) =>
  postJson<{ ok: boolean }>(s, `/api/calls/${callId}/messages`, { text });

export const endCall = (s: Settings, id: string) => postJson<{ ok: boolean }>(s, `/api/calls/${id}/hangup`, {});

/** One poll may take at most this long; a request frozen while the tab was in the background is dropped. */
const POLL_TIMEOUT_MS = 8000;

/**
 * Polls the call until it finishes. Polling (rather than server-sent events) survives tunnels,
 * proxies and mobile browsers backgrounding the tab. Answering the call on the same phone
 * backgrounds the browser, so polls time out instead of hanging, and polling resumes the moment
 * the page is visible again.
 */
export function watchCall(s: Settings, id: string, onUpdate: (r: CallRecord) => void, onError: (msg: string) => void) {
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
      const r = await request<CallRecord>(s, `/api/calls/${id}`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) });
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
  const onVisible = () => document.visibilityState === 'visible' && void tick();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  void tick();
  return () => {
    stopped = true;
    clearTimeout(next);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
