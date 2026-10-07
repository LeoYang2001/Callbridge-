import type { IntakeContext } from '../../shared/intake';
import type { CallRecord, CallRequest, IntakeCheckResult, IntakeDraft, IntakeSession, PublicConfig } from '../../shared/types';
import type { Settings } from './settings';

function endpoint(s: Settings, path: string) {
  return `${s.serverUrl.trim().replace(/\/+$/, '')}${path}`;
}

function headers(s: Settings, extra: Record<string, string> = {}) {
  return {
    ...extra,
    // Lets requests through ngrok's free-tier browser interstitial.
    'ngrok-skip-browser-warning': '1',
    ...(s.accessKey ? { Authorization: `Bearer ${s.accessKey}` } : {}),
  };
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

async function request<T>(s: Settings, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(endpoint(s, path), { ...init, headers: headers(s, init.headers as Record<string, string>) });
  } catch {
    throw new Error(`Can't reach the server${s.serverUrl ? ` at ${s.serverUrl}` : ''}. Check Settings and that the server is running.`);
  }
  if (res.status === 401) {
    throw new Error(s.accessKey ? 'The server rejected the access key. Check Settings.' : 'Enter your access key in Settings to connect.');
  }
  return json<T>(res);
}

export const getConfig = (s: Settings) => request<PublicConfig>(s, '/api/config');

export const startCall = (s: Settings, req: CallRequest) =>
  request<CallRecord>(s, '/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

const postJson = <T>(s: Settings, path: string, body: unknown) =>
  request<T>(s, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const createIntakeSession = (s: Settings, context: IntakeContext & { followUpOf?: string }) =>
  postJson<IntakeSession>(s, '/api/intake/session', context);

export const checkIntake = (s: Settings, context: IntakeContext, draft: IntakeDraft) =>
  postJson<IntakeCheckResult>(s, '/api/intake/check', { context, draft });

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
