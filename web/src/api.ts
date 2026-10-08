import { watchCall as watch, type Connection } from '../../shared/client/api';
import type { CallRecord } from '../../shared/types';

export * from '../../shared/client/api';

/** Polls the call until it finishes, and again the moment the tab is visible after being backgrounded. */
export function watchCall(s: Connection, id: string, onUpdate: (r: CallRecord) => void, onError: (msg: string) => void) {
  return watch(s, id, onUpdate, onError, (poll) => {
    const onVisible = () => document.visibilityState === 'visible' && poll();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  });
}
