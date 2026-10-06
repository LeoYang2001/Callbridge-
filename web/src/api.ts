import type { CallRecord, CallRequest, PublicConfig } from '../../shared/types';
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
    if (res.status === 401) throw new Error('The server rejected the access key. Check Settings.');
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
  return json<T>(res);
}

export const getConfig = (s: Settings) => request<PublicConfig>(s, '/api/config');

export const startCall = (s: Settings, req: CallRequest) =>
  request<CallRecord>(s, '/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

/**
 * Polls the call until it finishes. Polling (rather than server-sent events) survives tunnels,
 * proxies and mobile browsers backgrounding the tab.
 */
export function watchCall(s: Settings, id: string, onUpdate: (r: CallRecord) => void, onError: (msg: string) => void) {
  let stopped = false;
  let failures = 0;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await request<CallRecord>(s, `/api/calls/${id}`);
      failures = 0;
      if (stopped) return;
      onUpdate(r);
      if (r.status === 'completed' || r.status === 'failed') return;
    } catch (e) {
      if (++failures >= 5) {
        onError((e as Error).message);
        return;
      }
    }
    setTimeout(tick, 1000);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
