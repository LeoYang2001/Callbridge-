import { AppState } from 'react-native';
import { watchCall as watch, type Connection } from '@shared/client/api';
import type { CallRecord } from '@shared/types';

export * from '@shared/client/api';

/**
 * Polls the call until it finishes. iOS freezes the app in the background (e.g. while the user
 * picks up the call on the same phone), so it polls again the moment the app is back in front.
 */
export function watchCall(s: Connection, id: string, onUpdate: (r: CallRecord) => void, onError: (msg: string) => void) {
  return watch(s, id, onUpdate, onError, (poll) => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && poll());
    return () => sub.remove();
  });
}
