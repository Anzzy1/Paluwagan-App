import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PasswordSheet } from '@/components/PasswordSheet';
import { Divider, type IconName, Segmented } from '@/components/ui/bits';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useChat } from '@/lib/ai';
import { confirmAction, notifyError } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { useColors, usePrefs, type ThemePref, type Toggles } from '@/lib/prefs';
import { disablePush } from '@/lib/push';
import { radius } from '@/theme/tokens';

const isWeb = Platform.OS === 'web';

/** App settings: how the app behaves on this device. Who you are lives in Profile. */
export default function SettingsScreen() {
  const { signOut, isDemo, isGuest, newGuest, enterDemo, userId, isOffline, exitOffline } = useAuth();
  const { themePref, setThemePref, toggles, setToggle } = usePrefs();
  const chat = useChat();
  const [pwOpen, setPwOpen] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const flip = (k: keyof Toggles) => (v: boolean) => {
    setToggle(k, v);
    if (k === 'haptics' && v) haptic('light');
  };
  const flipPush = (v: boolean) => {
    setToggle('push', v);
    // Turning on re-registers automatically (usePushRegistration); turning off removes the token.
    if (!v) disablePush(userId).catch((e) => notifyError(e, 'Couldn’t turn off notifications'));
  };

  const confirmSignOut = () =>
    confirmAction(isDemo ? 'Exit sample data?' : 'Sign out?', '', signOut, { confirmText: isDemo ? 'Exit' : 'Sign out', destructive: true });
  const confirmNewGuest = () =>
    confirmAction(
      'Start as a new test user?',
      'You’ll get a fresh guest account. The current guest can’t be restored, but paluwagan it joined keep its records. Tip: use a private/incognito window to test as several members at once.',
      newGuest,
      { confirmText: 'Start fresh', destructive: true },
    );
  const confirmClearChat = () =>
    confirmAction('Clear chat history?', 'Your conversation with Ipon on this device will be deleted.', chat.clear, { confirmText: 'Clear', destructive: true });

  return (
    <Screen back title="Settings" narrow>
      {!isOffline && !isGuest && !isDemo && (
        <Section title="Account">
          <Card style={styles.list}>
            <Row icon="lock" title="Set or change password" subtitle="Log in with your email and password." onPress={() => setPwOpen(true)} />
          </Card>
          <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
        </Section>
      )}
      {(isOffline || isGuest) && (
        <Section title="Account">
          <Card style={styles.list}>
            <Row
              icon="user"
              title="Log in or create account"
              subtitle={isOffline ? 'Unlock online paluwagan, Ipon goals and Ask Ipon. Offline paluwagan stay on this device.' : 'Guest accounts are for testing. Log in to keep your data.'}
              onPress={isOffline ? exitOffline : signOut}
            />
          </Card>
        </Section>
      )}

      <Section title="Notifications">
        <Card style={styles.list}>
          <Row
            icon="bell"
            title="Push notifications"
            subtitle={isWeb ? 'Available in the mobile app' : 'Payment reminders, receipt reviews and payout alerts'}
            value={!isWeb && toggles.push}
            onChange={isWeb ? undefined : flipPush}
          />
        </Card>
      </Section>

      <Section title="Privacy">
        <Card style={styles.list}>
          <Row icon="eye-off" title="Hide amounts" subtitle="Show ₱••• instead of balances, handy in public" value={toggles.hideAmounts} onChange={flip('hideAmounts')} />
          <Divider />
          <Row
            icon="message-circle"
            title="Clear Ask Ipon history"
            subtitle={chat.messages.length ? `${chat.messages.length} messages saved on this device` : 'No saved messages'}
            onPress={chat.messages.length ? confirmClearChat : undefined}
          />
        </Card>
      </Section>

      <Section title="App experience">
        <Card style={styles.list}>
          <Row icon="smile" title="Ipon tips" subtitle="Little reactions from Ipon when things happen" value={toggles.mascotTips} onChange={flip('mascotTips')} />
          <Divider />
          <Row icon="star" title="Celebration effects" subtitle="Confetti on draws and finished goals" value={toggles.celebrations} onChange={flip('celebrations')} />
          <Divider />
          <Row icon="volume-2" title="Game sounds" subtitle="Music and sound effects during the bunutan" value={toggles.sounds} onChange={flip('sounds')} />
          <Divider />
          <Row
            icon="smartphone"
            title="Haptic feedback"
            subtitle={isWeb ? 'Available in the mobile app' : 'Light vibration when you tap'}
            value={!isWeb && toggles.haptics}
            onChange={isWeb ? undefined : flip('haptics')}
          />
        </Card>
      </Section>

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

      <Section title="Testing">
        <Card style={styles.list}>
          {isDemo ? (
            <Row icon="log-out" title="Exit sample data" subtitle="Go back to your own account" onPress={signOut} />
          ) : (
            <Row icon="eye" title="Preview with sample data" subtitle="See the app filled with example paluwagan" onPress={enterDemo} />
          )}
          {(isGuest || isDemo) && !isOffline && (
            <>
              <Divider />
              <Row icon="user-plus" title="Start as a new test user" subtitle="Get a fresh guest account" onPress={confirmNewGuest} />
            </>
          )}
        </Card>
      </Section>

      {!isGuest && !isDemo && !isOffline && (
        <Card style={styles.list}>
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

function Row({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  value,
  onChange,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
  /** When set (with or without onChange) the row shows a switch. */
  value?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const c = useColors();
  const isSwitch = value !== undefined;
  const press = isSwitch ? (onChange ? () => onChange(!value) : undefined) : onPress;
  return (
    <PressableScale
      onPress={press}
      disabled={!press}
      dimWhenDisabled={false}
      hapticOnPress={false}
      scaleTo={0.99}
      accessibilityRole={isSwitch ? 'switch' : 'button'}
      accessibilityState={isSwitch ? { checked: value, disabled: !onChange } : undefined}
      style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? c.dangerBg : c.brandSoft }]}>
        <Feather name={icon} size={17} color={danger ? c.danger : c.brandText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyBold" color={danger ? c.danger : c.text}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {isSwitch ? <Switch value={value} disabled={!onChange} /> : onPress && !danger && <Feather name="chevron-right" size={18} color={c.textFaint} />}
    </PressableScale>
  );
}

/** Display-only switch; the whole row is the touch target. */
function Switch({ value, disabled }: { value: boolean; disabled?: boolean }) {
  const c = useColors();
  const t = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    t.set(withTiming(value ? 1 : 0, { duration: 180 }));
  }, [value, t]);
  const off = c.borderStrong;
  const on = c.brand;
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(t.get(), [0, 1], [off, on]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: t.get() * 18 }] }));
  return (
    <View pointerEvents="none" style={{ opacity: disabled ? 0.45 : 1 }}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
