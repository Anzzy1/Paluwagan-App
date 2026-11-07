import { Feather } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Brand';
import { Avatar, Chip, ProgressBar } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDesktop, usePrefs, useT } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

/** Small product previews used as onboarding artwork. */
function Art({ step }: { step: number }) {
  const c = useColors();
  const card = [styles.mock, { backgroundColor: c.surface, borderColor: c.border }];
  if (step === 0) {
    return (
      <View style={card}>
        <Text variant="caption" tone="muted">
          Your next payout
        </Text>
        <Text variant="hero">₱12,000</Text>
        <ProgressBar progress={0.62} />
        <View style={styles.row}>
          <Text variant="small" tone="muted">
            Round 5 of 8
          </Text>
          <Chip label="Nov 30" tone="brand" />
        </View>
      </View>
    );
  }
  if (step === 1) {
    return (
      <View style={card}>
        {['Maria Santos', 'Paolo Reyes', 'Juan Dela Cruz'].map((n, i) => (
          <View key={n} style={[styles.row, { paddingVertical: 6, justifyContent: 'flex-start', gap: 10 }]}>
            <Text variant="money" tone="faint" style={{ width: 18 }}>
              {i + 1}
            </Text>
            <Avatar name={n} size={30} />
            <Text variant="bodyMedium">{n}</Text>
          </View>
        ))}
        <View style={[styles.verified, { backgroundColor: c.successBg }]}>
          <Feather name="check-circle" size={14} color={c.success} />
          <Text variant="caption" tone="success">
            Draw verified · commitment matches
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={card}>
      {[
        ['Bea Garcia', true],
        ['Carlo Mendoza', false],
      ].map(([n, paid]) => (
        <View key={String(n)} style={[styles.row, { paddingVertical: 6 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={String(n)} size={30} />
            <View>
              <Text variant="bodyMedium">{n}</Text>
              <Text variant="small" tone="muted">
                ₱1,500 · GCash
              </Text>
            </View>
          </View>
          <Chip label={paid ? 'Paid' : 'Awaiting'} tone={paid ? 'success' : 'info'} />
        </View>
      ))}
      <View style={[styles.row, { paddingTop: 8 }]}>
        <Text variant="small" tone="muted">
          Trust Score
        </Text>
        <Text variant="money" tone="brand">
          96 · Excellent
        </Text>
      </View>
    </View>
  );
}

export default function Onboarding() {
  const { onboarded, setOnboarded } = usePrefs();
  const t = useT();
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  // On desktop the product story sits beside the sign-in form instead.
  if (onboarded || desktop) return <Redirect href="/login" />;

  const finish = () => {
    setOnboarded(true);
    router.replace('/login');
  };
  const last = step === 2;
  const key = `onb.${step + 1}` as 'onb.1';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}>
      <View style={styles.top}>
        <Logo />
        <PressableScale onPress={finish} hapticOnPress={false}>
          <Text variant="smallBold" tone="muted">
            Skip
          </Text>
        </PressableScale>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
        <Animated.View key={`art-${step}`} entering={FadeIn.duration(300)} style={[styles.artWrap, { backgroundColor: c.surfaceAlt }]}>
          <Art step={step} />
        </Animated.View>
        <Animated.View key={`text-${step}`} entering={FadeInRight.duration(300)} style={{ gap: 10 }}>
          <Text variant="display">{t(`${key}.title` as 'onb.1.title')}</Text>
          <Text tone="muted" style={{ fontSize: 16, lineHeight: 24 }}>
            {t(`${key}.body` as 'onb.1.body')}
          </Text>
        </Animated.View>
      </View>

      <View style={{ gap: 20 }}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === step ? c.ink : c.borderStrong, width: i === step ? 20 : 6 }]} />
          ))}
        </View>
        <Button title={last ? t('onb.start') : t('onb.next')} iconRight="arrow-right" onPress={() => (last ? finish() : setStep(step + 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  artWrap: { borderRadius: radius.xl, padding: 24, minHeight: 260, justifyContent: 'center' },
  mock: { borderRadius: radius.lg, borderWidth: 1, padding: 18, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
});
