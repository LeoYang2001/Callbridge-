import type { CallRecord, CallRequest, PublicConfig } from '../../shared/types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const getConfig = () => fetch('/api/config').then((r) => json<PublicConfig>(r));

export const startCall = (req: CallRequest) =>
  fetch('/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  }).then((r) => json<CallRecord>(r));

/** Subscribes to live updates for a call. Returns an unsubscribe function. */
export function watchCall(id: string, onUpdate: (r: CallRecord) => void, onError: (msg: string) => void) {
  const es = new EventSource(`/api/calls/${id}/stream`);
  es.onmessage = (e) => {
    const record = JSON.parse(e.data) as CallRecord;
    onUpdate(record);
    if (record.status === 'completed' || record.status === 'failed') es.close();
  };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) onError('Lost connection to the server.');
  };
  return () => es.close();
}
