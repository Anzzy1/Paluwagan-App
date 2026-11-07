import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Divider, type IconName, Segmented } from '@/components/ui/bits';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useChat } from '@/lib/ai';
import { confirmAction } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { useColors, usePrefs, type ThemePref } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

/** App settings: how the app behaves on this device. Who you are lives in Profile. */
export default function SettingsScreen() {
  const { signOut, isDemo, isGuest, newGuest, enterDemo } = useAuth();
  const { themePref, setThemePref } = usePrefs();
  const chat = useChat();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const confirmSignOut = () =>
    confirmAction(isDemo ? 'Exit sample data?' : 'Sign out?', '', signOut, { confirmText: isDemo ? 'Exit' : 'Sign out', destructive: true });
  const confirmNewGuest = () =>
    confirmAction(
      'Start as a new test user?',
      'You’ll get a fresh guest account. The current guest can’t be restored, but circles it joined keep its records. Tip: use a private/incognito window to test as several members at once.',
      newGuest,
      { confirmText: 'Start fresh', destructive: true },
    );
  const confirmClearChat = () =>
    confirmAction('Clear chat history?', 'Your conversation with Ipon on this device will be deleted.', chat.clear, { confirmText: 'Clear', destructive: true });

  return (
    <Screen back title="Settings" narrow>
      <Section title="Appearance">
        <Card style={{ gap: 12 }}>
          <Text variant="smallBold" tone="muted">
            Theme
          </Text>
          <Segmented<ThemePref>
            value={themePref}
            onChange={setThemePref}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Data & privacy">
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          <Row
            icon="message-circle"
            title="Clear Ask Ipon history"
            subtitle={chat.messages.length ? `${chat.messages.length} messages saved on this device` : 'No saved messages'}
            onPress={chat.messages.length ? confirmClearChat : undefined}
          />
        </Card>
      </Section>

      <Section title="Testing">
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {isDemo ? (
            <Row icon="log-out" title="Exit sample data" subtitle="Go back to your own account" onPress={signOut} />
          ) : (
            <Row icon="eye" title="Preview with sample data" subtitle="See the app filled with example circles" onPress={enterDemo} />
          )}
          {(isGuest || isDemo) && (
            <>
              <Divider />
              <Row icon="user-plus" title="Start as a new test user" subtitle="Get a fresh guest account" onPress={confirmNewGuest} />
            </>
          )}
        </Card>
      </Section>

      {!isGuest && !isDemo && (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          <Row icon="log-out" title="Sign out" danger onPress={confirmSignOut} />
        </Card>
      )}

      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
        <Text variant="smallBold" tone="muted">
          Paluwagan · v{version}
        </Text>
        <Text variant="small" tone="faint" center>
          Paluwagan records contributions and payouts. It never holds funds.
        </Text>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="overline" tone="faint" style={{ paddingHorizontal: 4 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ icon, title, subtitle, onPress, danger }: { icon: IconName; title: string; subtitle?: string; onPress?: () => void; danger?: boolean }) {
  const c = useColors();
  const fg = danger ? c.danger : c.text;
  return (
    <PressableScale onPress={onPress} disabled={!onPress} dimWhenDisabled={false} hapticOnPress={false} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? c.dangerBg : c.brandSoft }]}>
        <Feather name={icon} size={17} color={danger ? c.danger : c.brandText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyBold" color={fg}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {onPress && !danger && <Feather name="chevron-right" size={18} color={c.textFaint} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
