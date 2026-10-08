import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/lib/session';
import { useNotifications } from '@/hooks/useNotifications';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { state } = useSession();
  useNotifications();
  useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync();
  }, [state.status]);
  if (state.status === 'loading') return null;
  const signedIn = state.status === 'signedIn';
  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'CallBridge' }} />
        <Stack.Screen name="intake" options={{ title: 'New call' }} />
        <Stack.Screen name="call/[id]" options={{ title: 'Call' }} />
        <Stack.Screen name="contacts" options={{ title: 'Phone book' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}
