import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallRecord, UserAnswer } from '@shared/types';
import { answerQuestion, endCall, sendCallMessage, watchCall } from '@/lib/api';
import { startListening, type Listener } from '@/lib/listen';
import { useSignedIn } from '@/lib/session';

const LIVE: CallRecord['status'][] = ['preparing', 'dialing', 'connected'];

/**
 * One call, live or finished: polls it until it's over, and the user's controls while it's live:
 * answer the assistant's questions, send it a message, listen in, hang up.
 */
export function useCall(id: string) {
  const { conn } = useSignedIn();
  const [call, setCall] = useState<CallRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCall(null);
    return watchCall(
      conn,
      id,
      (r) => {
        setCall(r);
        setError(null);
      },
      setError,
    );
  }, [conn, id]);

  const live = call ? LIVE.includes(call.status) : false;
  /** Questions the other party is holding for, oldest first. */
  const pending = call?.questions?.filter((q) => q.status === 'pending') ?? [];

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);

  return {
    call,
    live,
    pending,
    error,
    /** Each returns an error message to show, or null. */
    answer: (questionId: string, answer: UserAnswer) => act(() => answerQuestion(conn, id, questionId, answer)),
    message: (text: string) => act(() => sendCallMessage(conn, id, text)),
    hangUp: () => act(() => endCall(conn, id)),
  };
}

/** Listening in on a live call through the phone's speaker. */
export function useListen(callId: string) {
  const { conn } = useSignedIn();
  const [state, setState] = useState<'off' | 'starting' | 'on'>('off');
  const [note, setNote] = useState<string | null>(null);
  const listenerRef = useRef<Listener | null>(null);

  useEffect(() => () => listenerRef.current?.stop(), []);

  const toggle = useCallback(async () => {
    if (listenerRef.current) {
      listenerRef.current.stop();
      listenerRef.current = null;
      setState('off');
      return;
    }
    setState('starting');
    setNote(null);
    try {
      listenerRef.current = await startListening(conn, callId, (reason) => {
        listenerRef.current = null;
        setState('off');
        setNote(reason);
      });
      setState('on');
    } catch (e) {
      setState('off');
      setNote((e as Error).message);
    }
  }, [conn, callId]);

  return { listening: state === 'on', starting: state === 'starting', note, toggle };
}
