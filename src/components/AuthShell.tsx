import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedMascot } from '@/components/AnimatedMascot';
import { WelcomeScene } from '@/components/auth/WelcomeScene';
import { BandScene, useBandColors } from '@/components/BandScene';
import type { MascotMood } from '@/components/Mascot';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { font } from '@/theme/tokens';

/**
 * Auth screens (log in, verify, setup): a green band with Ipon saying `say`,
 * then the form. On desktop the welcome scene sits beside the form.
 */
export function AuthShell({
  title,
  subtitle,
  back,
  children,
  footer,
  say,
  mood = 'happy',
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** What Ipon says in the speech bubble. */
  say?: string;
  mood?: MascotMood;
  /** Custom back action (e.g. the previous step); defaults to navigating back. */
  onBack?: () => void;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const grad = useBandColors();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  const heading = (
    <Animated.View entering={FadeInUp.springify().damping(16)} style={{ gap: 8 }}>
      <Text style={[styles.title, desktop && { fontSize: 40, lineHeight: 44 }]}>{title}</Text>
      {subtitle && (
        <Text tone="muted" style={{ fontSize: 15, lineHeight: 22 }}>
          {subtitle}
        </Text>
      )}
    </Animated.View>
  );

  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg, padding: 20, gap: 20 }}>
        <WelcomeScene style={{ flex: 1.1, borderRadius: 36 }} lines={say ? [say] : undefined} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formPane} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 22, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            {back && <BackButton onPress={goBack} light={false} />}
            {heading}
            {children}
            {footer && <View style={{ gap: 10 }}>{footer}</View>}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.band, { paddingTop: insets.top + 10 }]}>
          <BandScene />
          <View style={{ height: 40, justifyContent: 'center' }}>{back && <BackButton onPress={goBack} light />}</View>
          <View style={styles.bandRow}>
            {say ? (
              <Animated.View key={say} entering={FadeIn.duration(300)} style={styles.bubble}>
                <Text variant="small" color="#0C1410" style={{ lineHeight: 19 }}>
                  {say}
                </Text>
                <View style={styles.tail} />
              </Animated.View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <AnimatedMascot size={104} mood={mood} pose="coin" action="wave" trigger={say} />
          </View>
        </LinearGradient>
        <View style={{ padding: 20, paddingTop: 24, gap: 20 }}>
          {heading}
          {children}
        </View>
      </ScrollView>
      {footer && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: c.bg }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

function BackButton({ onPress, light }: { onPress: () => void; light: boolean }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      hapticOnPress={false}
      accessibilityLabel="Back"
      style={[styles.back, { backgroundColor: light ? 'rgba(255,255,255,0.22)' : c.surface, borderColor: light ? 'transparent' : c.border }]}>
      <Feather name="arrow-left" size={18} color={light ? '#FFFFFF' : c.text} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.cuteBold, fontSize: 32, lineHeight: 36, letterSpacing: -0.4 },
  band: { paddingHorizontal: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  bandRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 },
  bubble: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 46 },
  tail: { position: 'absolute', right: -5, bottom: 14, width: 14, height: 14, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderRadius: 3 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, alignSelf: 'flex-start' },
  formPane: { flexGrow: 1, justifyContent: 'center', padding: 40 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
});
