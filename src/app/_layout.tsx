import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DialogHost } from '@/components/ui/DialogHost';
import { AuthProvider, useAuth } from '@/lib/auth';
import { PrefsProvider, useColors, useIsDark } from '@/lib/prefs';
import { isSupabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, Fredoka_500Medium, Fredoka_600SemiBold });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <PrefsProvider>
          <AuthProvider>{fontsLoaded ? <RootNavigator /> : null}</AuthProvider>
        </PrefsProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, initializing, profile, profileLoading, guestError } = useAuth();
  const dark = useIsDark();
  const c = useColors();
  const ready = !initializing && !profileLoading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = !!session;
  const profileDone = !!profile?.full_name;
  const navTheme = dark ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={{ ...navTheme, colors: { ...navTheme.colors, background: c.bg } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!signedIn && (!isSupabaseConfigured || !!guestError)}>
          <Stack.Screen name="not-configured" />
        </Stack.Protected>
        {/* Email / phone sign-in is built but deferred: the app starts on a guest account for now. */}
        <Stack.Protected guard={false}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !profileDone}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && profileDone}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <DialogHost />
    </ThemeProvider>
  );
}
