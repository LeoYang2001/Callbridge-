import { useCallback, useState } from 'react';
import { draftToRequest, type IntakeContext } from '@shared/intake';
import type { CallRecord, CallRequest, IntakeDraft } from '@shared/types';
import { startCall } from '@/lib/api';
import { useSignedIn } from '@/lib/session';
import type { Involvement } from './usePreferences';

/**
 * Turns what the intake gathered into a call request and places the call. The server validates
 * all of it again (policy, sensitive data, limits) and its error is shown as is.
 */
export function useStartCall() {
  const { conn, me } = useSignedIn();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildRequest = useCallback(
    (draft: IntakeDraft, context: IntakeContext, involvement: Involvement): CallRequest => {
      const req = draftToRequest(draft, context);
      const p = me.profile;
      return {
        ...req,
        involvement,
        holdSeconds: p.holdSeconds,
        user: { ...req.user, name: p.name || req.user.name, pronouns: p.pronouns, preferredLanguage: p.preferredLanguage },
      };
    },
    [me.profile],
  );

  const start = useCallback(
    async (request: CallRequest): Promise<CallRecord | null> => {
      setError(null);
      setSubmitting(true);
      try {
        return await startCall(conn, request);
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [conn],
  );

  return { buildRequest, start, submitting, error };
}
