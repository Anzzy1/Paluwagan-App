import { Stack } from 'expo-router';
import { View } from 'react-native';

import { MascotToastHost } from '@/components/MascotToast';
import { Sidebar } from '@/components/Sidebar';
import { useRealtimeSync } from '@/lib/api';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { usePushRegistration } from '@/lib/push';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const c = useColors();
  const desktop = useIsDesktop();
  useRealtimeSync();
  usePushRegistration();

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: desktop ? 'none' : 'default' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create" options={{ presentation: desktop ? 'card' : 'modal' }} />
      <Stack.Screen name="join" options={{ presentation: desktop ? 'card' : 'modal' }} />
      <Stack.Screen name="assistant" options={{ presentation: desktop ? 'card' : 'modal' }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="notifications" />
    </Stack>
  );

  if (!desktop) {
    return (
      <View style={{ flex: 1 }}>
        {stack}
        <MascotToastHost />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
      <Sidebar />
      <View style={{ flex: 1 }}>
        {stack}
        <MascotToastHost />
      </View>
    </View>
  );
}
