import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActiveCallProvider } from '@/call/ActiveCall';
import { CallCapsule } from '@/call/CallCapsule';
import { GlowProvider } from '@/glow/GlowContext';
import { useNotifications } from '@/hooks/useNotifications';
import { SessionProvider, useSession } from '@/lib/session';
import { MenuProvider } from '@/nav/Menu';
import { ToastProvider } from '@/ui/Toast';

SplashScreen.preventAutoHideAsync();

/** Navigation draws nothing behind screens, so the edge glow at the root shows through. */
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' } };

function Routes() {
  const { state } = useSession();
  useNotifications();
  useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync();
  }, [state.status]);
  if (state.status === 'loading') return null;
  const signedIn = state.status === 'signedIn';
  // New accounts go through the profile interview first.
  const onboarded = state.status === 'signedIn' && state.me.profile.onboarded;
  return (
    <ActiveCallProvider>
      <MenuProvider>
        {/* No headers and no tab bar: screens are transparent over the edge glow. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'none' }}>
          <Stack.Protected guard={signedIn && !onboarded}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="index" />
            <Stack.Screen name="intake" />
            <Stack.Screen name="call/[id]" />
            <Stack.Screen name="calls" />
            <Stack.Screen name="contacts/index" />
            <Stack.Screen name="contacts/import" />
            <Stack.Screen name="me" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="errands" />
          </Stack.Protected>
          <Stack.Screen name="dev/glow" />
          <Stack.Screen name="dev/preview" />
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
        <CallCapsule />
      </MenuProvider>
    </ActiveCallProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <GlowProvider>
        <ThemeProvider value={theme}>
          <ToastProvider>
            <StatusBar style="dark" />
            <Routes />
          </ToastProvider>
        </ThemeProvider>
      </GlowProvider>
    </SessionProvider>
  );
}
