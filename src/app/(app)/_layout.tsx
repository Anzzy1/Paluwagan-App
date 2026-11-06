import { Stack } from 'expo-router';

import { useRealtimeSync } from '@/lib/api';
import { useColors } from '@/lib/prefs';
import { usePushRegistration } from '@/lib/push';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const c = useColors();
  useRealtimeSync();
  usePushRegistration();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="join" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
