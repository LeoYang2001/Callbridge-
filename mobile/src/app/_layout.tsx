import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GlowProvider } from '@/glow/GlowContext';
import { useApplyUpdates } from '@/lib/updates';
import { SessionProvider, useSession } from '@/lib/session';
import { MenuProvider } from '@/nav/Menu';
import { ToastProvider } from '@/ui/Toast';

SplashScreen.preventAutoHideAsync();

/** Navigation draws nothing behind screens, so the edge glow at the root shows through. */
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' } };

/** Applies a downloaded over-the-air update at a safe moment (see lib/updates). */
function UpdateGate() {
  useApplyUpdates();
  return null;
}

function Routes() {
  const { state } = useSession();
  useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync();
  }, [state.status]);
  if (state.status === 'loading') return null;
  const signedIn = state.status === 'signedIn';
  // New accounts set up their profile first.
  const onboarded = state.status === 'signedIn' && state.me.profile.onboarded;
  return (
    <MenuProvider enabled={onboarded}>
        {/* No headers and no tab bar: screens are transparent over the edge glow. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'none' }}>
          <Stack.Protected guard={signedIn && !onboarded}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="index" />
            <Stack.Screen name="translate/[id]" />
            <Stack.Screen name="calls" />
            <Stack.Screen name="contacts/index" />
            <Stack.Screen name="contacts/import" />
            <Stack.Screen name="contacts/[id]" />
            <Stack.Screen name="me" />
          </Stack.Protected>
          <Stack.Screen name="dev/glow" />
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
        <UpdateGate />
    </MenuProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
