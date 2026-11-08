import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WelcomeScene } from '@/components/auth/WelcomeScene';
import { Logo } from '@/components/Brand';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/lib/auth';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { font } from '@/theme/tokens';

/** The first screen: a playful welcome with Ipon, then create an account, log in, or go offline. */
export default function Welcome() {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { goOffline, enterDemo } = useAuth();

  const panel = (
    <View style={{ gap: 22, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
      {desktop && <Logo size={30} />}
      <Animated.View entering={FadeInUp.delay(150).springify().damping(16)} style={{ gap: 10 }}>
        <Text style={[styles.headline, desktop && { fontSize: 52, lineHeight: 56 }]}>
          Ipon together.{'\n'}
          <Text style={[styles.headline, desktop && { fontSize: 52, lineHeight: 56 }]} color={c.brandText}>
            Sahod on time.
          </Text>
        </Text>
        <Text tone="muted" style={{ fontSize: 16, lineHeight: 24 }}>
          The friendly way to run your paluwagan: a fair bunutan, every hulog tracked, and reminders so no one forgets.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(300).springify().damping(16)} style={{ gap: 10 }}>
        <Button title="Create an account" iconRight="arrow-right" onPress={() => router.push({ pathname: '/login', params: { mode: 'signup' } })} />
        <Button title="I already have an account" variant="secondary" onPress={() => router.push({ pathname: '/login', params: { mode: 'login' } })} />
        <PressableScale onPress={goOffline} hapticOnPress={false} style={[styles.offline, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.offlineIcon, { backgroundColor: c.brandSoft }]}>
            <Feather name="smartphone" size={18} color={c.brandText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">Continue offline</Text>
            <Text variant="caption" tone="muted">
              No account. Run paluwagan on this phone only.
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={c.textFaint} />
        </PressableScale>
      </Animated.View>

      <PressableScale onPress={enterDemo} hapticOnPress={false} style={{ alignSelf: 'center', paddingVertical: 4 }}>
        <Text variant="smallBold" tone="muted">
          Just looking? <Text variant="smallBold" tone="brand">Explore the demo</Text>
        </Text>
      </PressableScale>
    </View>
  );

  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg, padding: 20, gap: 20 }}>
        <WelcomeScene style={{ flex: 1.1, borderRadius: 36 }} />
        <View style={{ flex: 1, justifyContent: 'center', padding: 40 }}>{panel}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <WelcomeScene style={[styles.mobileScene, { paddingTop: insets.top }]} />
      <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 18) }]}>{panel}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { fontFamily: font.cuteBold, fontSize: 38, lineHeight: 42, letterSpacing: -0.5 },
  mobileScene: { flex: 1, minHeight: 330, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  sheet: { paddingHorizontal: 20, paddingTop: 22 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1 },
  offlineIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
