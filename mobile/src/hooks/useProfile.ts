import { useCallback } from 'react';
import { deleteAccount, updateProfile } from '@/lib/api';
import { useSignedIn } from '@/lib/session';

/** Editing the profile directly (the interview edits it by voice), and the account itself. */
export function useProfile() {
  const { conn, me, setMe, signOut } = useSignedIn();

  const update = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        setMe(await updateProfile(conn, patch));
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [conn, setMe],
  );

  return {
    me,
    profile: me.profile,
    update,
    /** Finished or skipped the profile interview. */
    finishOnboarding: () => (me.profile.onboarded ? Promise.resolve(null) : update({ onboarded: true })),
    signOut,
    /** Deletes the account, its profile and its call history, then signs out. */
    deleteAccount: async () => {
      await deleteAccount(conn);
      await signOut();
    },
  };
}
