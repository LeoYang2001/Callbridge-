import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { CallSummary } from '@shared/types';
import { deleteCall, listCalls } from '@/lib/api';
import { useSignedIn } from '@/lib/session';

/** The call history, newest first; refreshed whenever the screen comes into view. */
export function useCalls() {
  const { conn } = useSignedIn();
  const [calls, setCalls] = useState<CallSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setCalls(await listCalls(conn));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [conn]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /** Swiped away: gone from the list at once, and back with the reason if the server says no. */
  const remove = useCallback(
    async (id: string) => {
      const before = calls;
      setCalls((list) => list?.filter((c) => c.id !== id) ?? list);
      try {
        await deleteCall(conn, id);
        setError(null);
      } catch (e) {
        setCalls(before);
        setError((e as Error).message);
      }
    },
    [conn, calls],
  );

  return { calls, error, refreshing, refresh, remove };
}
