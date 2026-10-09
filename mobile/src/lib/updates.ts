import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useActiveCall } from '@/call/ActiveCall';

/**
 * Over-the-air updates (EAS Update) for TestFlight and store builds. The app checks on launch
 * and downloads in the background; a downloaded update is applied the next time the user comes
 * back to the app, never in the middle of a live call. Development builds load code from the
 * Mac instead, so this does nothing there.
 */
export function useApplyUpdates() {
  const { isUpdatePending } = Updates.useUpdates();
  const { live } = useActiveCall();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled || !isUpdatePending) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !liveRef.current) void Updates.reloadAsync().catch(() => {});
    });
    return () => sub.remove();
  }, [isUpdatePending]);
}

/** "0.1.0 (12) · update 3f2a…" for the Me screen, so testers can say what they're running. */
export function versionLabel(appVersion: string | undefined, build: string | null): string {
  const update = Updates.updateId && !Updates.isEmbeddedLaunch ? ` · update ${Updates.updateId.slice(0, 7)}` : '';
  return `${appVersion ?? '?'}${build ? ` (${build})` : ''}${update}`;
}
