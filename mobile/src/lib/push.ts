import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushData } from '@shared/types';
import { registerPushToken, removePushToken, type Connection } from './api';

/**
 * Push notifications: the server sends one when the assistant puts someone on hold for the
 * user's decision, and when a call ends. Tapping one opens that call (see useNotificationRouting).
 */

// While the app is open the call screen already shows everything, but a banner still helps if the
// user is on another screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

let registered: string | null = null;

/**
 * Asks for permission (the first time) and registers this phone with the server. Returns why it
 * couldn't, or null when it's registered. Needs a development or store build with an EAS project
 * id; the simulator and Expo Go can't get a push token.
 */
export async function registerForPush(conn: Connection): Promise<string | null> {
  if (!Device.isDevice) return 'Push notifications need a real phone.';
  if (Platform.OS === 'android') {
    // Android 13+ needs the channel before it will ask for permission or issue a token.
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 150, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const { granted } = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!granted) return 'Notifications are off. Turn them on in Settings to hear when someone is holding for you.';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'This build has no EAS project id yet (run `eas init`), so it cannot receive notifications.';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(conn, token, Platform.OS === 'android' ? 'android' : 'ios');
  registered = token;
  return null;
}

/** Before signing out: this phone stops getting the account's notifications. */
export async function unregisterForPush(conn: Connection) {
  if (!registered) return;
  await removePushToken(conn, registered).catch(() => {});
  registered = null;
}

export const pushDataOf = (n: Notifications.Notification): PushData | null => {
  const data = n.request.content.data as Partial<PushData> | undefined;
  return data?.callId && data.kind ? (data as PushData) : null;
};
