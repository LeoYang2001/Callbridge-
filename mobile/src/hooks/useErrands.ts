import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { isActiveErrand } from '@shared/client/errands';
import type { CallRequest, Errand } from '@shared/types';
import { addErrand, cancelErrand, listErrands, retryErrand } from '@/lib/api';
import { useSignedIn } from '@/lib/session';

/**
 * The errand queue: calls the server places later on its own, one at a time, within calling
 * hours. Refreshed while the screen is in view and anything is still waiting.
 */
export function useErrands() {
  const { conn } = useSignedIn();
  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setErrands(await listErrands(conn));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [conn]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const t = setInterval(() => void refresh(), 8000);
      return () => clearInterval(t);
    }, [refresh]),
  );

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [refresh],
  );

  return {
    errands,
    active: errands?.filter(isActiveErrand) ?? [],
    finished: errands?.filter((e) => !isActiveErrand(e)) ?? [],
    error,
    refresh,
    /** Each returns an error message to show, or null. */
    cancel: (id: string) => act(() => cancelErrand(conn, id)),
    retry: (id: string) => act(() => retryErrand(conn, id)),
  };
}

/** Queuing a new errand (from the intake review). */
export function useAddErrand() {
  const { conn } = useSignedIn();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = useCallback(
    async (request: CallRequest, notBefore?: number): Promise<Errand | null> => {
      setSubmitting(true);
      setError(null);
      try {
        return await addErrand(conn, request, notBefore);
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [conn],
  );
  return { add, submitting, error };
}
