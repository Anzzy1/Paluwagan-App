import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DialogHost } from '@/components/ui/DialogHost';
import { AuthProvider, useAuth } from '@/lib/auth';
import { demoState } from '@/lib/demo';
import { PrefsProvider, useColors, useIsDark } from '@/lib/prefs';
import { kv } from '@/lib/storage';

SplashScreen.preventAutoHideAsync();
// Safety net: never leave people stuck on the logo, whatever is still loading.
setTimeout(() => void SplashScreen.hideAsync().catch(() => undefined), 10_000);

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  // gcTime must outlive the saved copy, or restored data is thrown away straight after loading.
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, gcTime: 7 * DAY } },
});

/** Keeps the last loaded paluwagan, goals and activity on the device, so they open without internet. */
const persister = createSyncStoragePersister({
  key: 'query-cache-v1',
  storage: { getItem: kv.get, setItem: kv.set, removeItem: kv.remove },
  throttleTime: 2_000,
});

const persistOptions = {
  persister,
  maxAge: 7 * DAY,
  dehydrateOptions: {
    // Never save demo data, and only save finished, successful loads.
    shouldDehydrateQuery: (q: { state: { status: string } }) => !demoState.on && q.state.status === 'success',
  },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, Fredoka_500Medium, Fredoka_600SemiBold });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <PrefsProvider>
          <AuthProvider>{fontsLoaded ? <RootNavigator /> : null}</AuthProvider>
        </PrefsProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, initializing, profile, profileLoading, guestError, isOffline, recovering } = useAuth();
  const dark = useIsDark();
  const c = useColors();
  const ready = !initializing && !profileLoading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // While resetting a password the code signs them in, but they stay on the reset screen until it's saved.
  const signedIn = !!session && !recovering;
  const profileDone = !!profile?.full_name;
  const navTheme = dark ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={{ ...navTheme, colors: { ...navTheme.colors, background: c.bg } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!signedIn && !isOffline && !!guestError}>
          <Stack.Screen name="not-configured" />
        </Stack.Protected>
        {/* Start: log in / create an account, or continue offline. */}
        <Stack.Protected guard={!signedIn && !isOffline && !guestError}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !profileDone}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={(signedIn && profileDone) || (!signedIn && isOffline)}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <DialogHost />
    </ThemeProvider>
  );
}
