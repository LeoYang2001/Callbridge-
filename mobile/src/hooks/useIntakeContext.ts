import { useMemo } from 'react';
import type { IntakeContext } from '@shared/intake';
import { NATURAL_VOICES, type RealtimeVoice } from '@shared/types';
import { useSignedIn } from '@/lib/session';

/**
 * Who the user is, for the intake and the call, from the profile. The voice is one of the two
 * natural ones (Marin or Cedar); an older voice saved before is read as Marin.
 */
export function useIntakeContext(): IntakeContext {
  const { me } = useSignedIn();
  const p = me.profile;
  const voice: RealtimeVoice = p.voice && (NATURAL_VOICES as readonly string[]).includes(p.voice) ? p.voice : 'marin';
  return useMemo(() => ({ userName: p.name, userLanguage: p.preferredLanguage, timezone: p.timezone, voice }), [p.name, p.preferredLanguage, p.timezone, voice]);
}
