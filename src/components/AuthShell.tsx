import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Brand';
import { Mascot } from '@/components/Mascot';
import type { IconName } from '@/components/ui/bits';
import { IconButton } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDesktop } from '@/lib/prefs';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'shuffle', title: 'Verifiable draw', body: 'Payout order is committed before the draw and can be checked by every member.' },
  { icon: 'file-text', title: 'Proof of payment', body: 'Members upload receipts; recipients confirm every transfer.' },
  { icon: 'bell', title: 'Automatic reminders', body: 'Notifications before each due date, with one-tap nudges.' },
  { icon: 'shield', title: 'Trust Score', body: 'An on-time payment record that follows each member across paluwagan.' },
];

/** Auth screens: split layout on desktop, single column on mobile. */
export function AuthShell({
  title,
  subtitle,
  back,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();

  const form = (
    <View style={{ gap: 20, width: '100%', maxWidth: 400, alignSelf: 'center' }}>
      {back && <IconButton icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} label="Back" />}
      {!desktop && !back && <Logo />}
      <View style={{ gap: 6 }}>
        <Text variant="display">{title}</Text>
        {subtitle && <Text tone="muted">{subtitle}</Text>}
      </View>
      {children}
      {desktop && footer && <View style={{ gap: 10 }}>{footer}</View>}
    </View>
  );

  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        <View style={[styles.brand, { backgroundColor: '#16A34A' }]}>
          <Logo inverted size={32} />
          <View style={{ gap: 26, maxWidth: 460 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
              <Mascot size={120} mood="excited" pose="cheer" />
              <View style={styles.hello}>
                <Text variant="smallBold" color="#16A34A">
                  Hi! I’m Ipon.
                </Text>
                <Text variant="small">I’ll keep your paluwagan fair and everyone on time.</Text>
              </View>
            </View>
            <Text variant="display" color="#FFFFFF" style={{ fontSize: 40, lineHeight: 46 }}>
              Paluwagan, made easy and fair.
            </Text>
            <View style={{ gap: 20 }}>
              {FEATURES.map((f) => (
                <View key={f.title} style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={styles.featureIcon}>
                    <Feather name={f.icon} size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyBold" color="#FFFFFF">
                      {f.title}
                    </Text>
                    <Text variant="small" color="rgba(255,255,255,0.78)">
                      {f.body}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <Text variant="small" color="rgba(255,255,255,0.7)">
            Paluwagan records contributions and payouts. It never holds your money.
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.formPane} keyboardShouldPersistTaps="handled">
          {form}
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16 }} keyboardShouldPersistTaps="handled">
        {form}
      </ScrollView>
      {footer && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), borderTopColor: c.border }]}>{footer}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { width: '44%', maxWidth: 620, padding: 48, justifyContent: 'space-between' },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formPane: { flexGrow: 1, justifyContent: 'center', padding: 48 },
  hello: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, gap: 2, marginBottom: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
