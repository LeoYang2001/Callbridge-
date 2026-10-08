import { useMemo } from 'react';
import type { IntakeContext } from '@shared/intake';
import type { RealtimeVoice } from '@shared/types';
import { useSignedIn } from '@/lib/session';

/** Who the user is, for the intake and the call: from the profile, with this phone's voice choice. */
export function useIntakeContext(voice: RealtimeVoice | null): IntakeContext {
  const { me } = useSignedIn();
  const p = me.profile;
  return useMemo(
    () => ({ userName: p.name, userLanguage: p.preferredLanguage, timezone: p.timezone, voice: voice ?? p.voice }),
    [p.name, p.preferredLanguage, p.timezone, p.voice, voice],
  );
}
