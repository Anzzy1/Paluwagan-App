import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/lib/auth';
import { checkConnection, useOnline } from '@/lib/network';
import { useColors, useIsDesktop } from '@/lib/prefs';

/** Small pill at the top while a signed-in user has no internet. Tap to check again. */
export function OfflineBanner() {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { isOffline } = useAuth();
  const online = useOnline();
  // Offline mode (no account) already knows it's offline; this is for signed-in users.
  if (online || isOffline) return null;
  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(200)} pointerEvents="box-none" style={[styles.wrap, { top: insets.top + (desktop ? 12 : 6) }]}>
      <PressableScale onPress={() => void checkConnection()} hapticOnPress={false} scaleTo={0.97} accessibilityRole="button" accessibilityLabel="You’re offline. Tap to check the connection again.">
        <View style={[styles.pill, { backgroundColor: c.ink }]}>
          <Feather name="wifi-off" size={14} color={c.onInk} />
          <Text variant="caption" color={c.onInk} numberOfLines={1}>
            Offline · offline paluwagan and ipon still work
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 900 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, maxWidth: '100%' },
});
