import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { pushDataOf, registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

/**
 * Registers this phone for notifications once signed in, and opens the call a tapped
 * notification is about (also when the tap launched the app). Returns why notifications
 * aren't available, if they aren't.
 */
export function useNotifications() {
  const { state } = useSession();
  const [problem, setProblem] = useState<string | null>(null);
  const conn = state.status === 'signedIn' ? state.conn : null;
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!conn) return;
    registerForPush(conn).then(setProblem, (e: Error) => setProblem(e.message));
  }, [conn]);

  useEffect(() => {
    const data = response ? pushDataOf(response.notification) : null;
    if (!conn || !data) return;
    router.push({ pathname: '/call/[id]', params: { id: data.callId } });
    void Notifications.clearLastNotificationResponseAsync?.();
  }, [response, conn]);

  return problem;
}
