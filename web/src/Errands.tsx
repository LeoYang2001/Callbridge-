import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { errandStatusText, isActiveErrand } from '../../shared/client/errands';
import { displayPhone } from '../../shared/phone';
import type { Errand } from '../../shared/types';
import { cancelErrand, listErrands, retryErrand } from './api';
import type { Settings } from './settings';

interface Props {
  settings: Settings;
  onClose: () => void;
  /** Open an errand's call (live or finished). */
  onOpenCall: (callId: string) => void;
}

/** The errand queue: what's waiting, what's being called, and how the rest went. */
export function Errands({ settings, onClose, onOpenCall }: Props) {
  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErrands(await listErrands(settings));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [settings]);

  // Refresh while there's anything left to do.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const active = errands?.filter(isActiveErrand) ?? [];
  const finished = errands?.filter((e) => !isActiveErrand(e)) ?? [];

  return (
    <>
      <div className="screen">
        <h1 className="title">Errands</h1>
        <p className="lede">
          Queued calls the assistant makes on its own, one at a time, within calling hours. Keep the server running; you'll get a notification if one needs you.
        </p>
        {error && <div className="bar-error">{error}</div>}
        {errands === null && <div className="muted">Loading…</div>}
        {errands?.length === 0 && <div className="muted">No errands yet. Set up a call and choose “Add to errands”.</div>}

        {active.length > 0 && <h2 className="errand-section">In the queue</h2>}
        {active.map((e) => (
          <ErrandCard key={e.id} e={e} onOpenCall={onOpenCall} actions={<button type="button" className="text-btn danger" onClick={() => act(() => cancelErrand(settings, e.id))}>Cancel</button>} />
        ))}

        {finished.length > 0 && <h2 className="errand-section">Finished</h2>}
        {finished.map((e) => (
          <ErrandCard
            key={e.id}
            e={e}
            onOpenCall={onOpenCall}
            actions={
              e.status !== 'done' && (
                <button type="button" className="text-btn" onClick={() => act(() => retryErrand(settings, e.id))}>
                  Try again
                </button>
              )
            }
          />
        ))}
      </div>

      <div className="bottom-bar">
        <div className="bar-row">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </>
  );
}

function ErrandCard({ e, onOpenCall, actions }: { e: Errand; onOpenCall: (callId: string) => void; actions?: ReactNode }) {
  const tone = e.status === 'done' ? 'good' : e.status === 'needs_you' ? 'warn' : e.status === 'failed' ? 'bad' : '';
  return (
    <div className="summary-card errand">
      <div className="errand-head">
        <b>{e.request.counterpartName || displayPhone(e.request.to)}</b>
        <span className={`errand-status ${tone}`}>{errandStatusText(e)}</span>
      </div>
      <div className="muted">{e.request.taskInUserLanguage || e.request.instructions}</div>
      {e.outcome && <p className="errand-outcome">{e.outcome}</p>}
      <div className="errand-actions">
        {e.callId && (
          <button type="button" className="text-btn" onClick={() => onOpenCall(e.callId!)}>
            {e.status === 'calling' ? 'Open live call' : 'See the call'}
          </button>
        )}
        {e.attempts.length > 1 && <span className="muted">{e.attempts.length} tries</span>}
        {actions}
      </div>
    </div>
  );
}
