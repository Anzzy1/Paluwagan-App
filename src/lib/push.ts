import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { demoState } from '@/lib/demo';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registers this device for Expo push and stores the token on the profile.
 * Silently skips where push is unavailable (simulators, web, Expo Go on Android,
 * or no EAS projectId configured yet).
 */
export function usePushRegistration() {
  const { userId, profile } = useAuth();
  const { toggles } = usePrefs();

  useEffect(() => {
    if (!toggles.push || !userId || demoState.on || Platform.OS === 'web' || !Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Payment reminders',
            // eslint-disable-next-line import/namespace -- enum is re-exported via export *
            importance: Notifications.AndroidImportance.HIGH,
          });
        }
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted' || cancelled) return;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (token && token !== profile?.push_token) {
          await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
        }
      } catch (e) {
        console.log('[push] registration skipped:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toggles.push, userId, profile?.push_token]);

  // Tapping a notification deep-links into the circle.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => sub.remove();
  }, []);
}

/** Stops push to this account by removing the stored device token. */
export async function disablePush(userId: string | null) {
  if (!userId || demoState.on) return;
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
}
