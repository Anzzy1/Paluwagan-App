import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, type ComponentType } from 'react';
import { View } from 'react-native';

import { Mascot } from '@/components/Mascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { confirmAction, notify } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { checkConnection, useOnline } from '@/lib/network';
import { useColors } from '@/lib/prefs';

const WHY = 'Online paluwagan and joining with an invite need an account so your data is saved and shared with your members.';
const KEEP = 'Your offline paluwagan and ipon goals stay on this device.';
const OFFLINE_OK = 'Offline paluwagan, ipon goals on this device and the local Ipon AI still work.';

/**
 * Run `go` only when an online feature can be used: the user has an account and is
 * connected. Offline-mode users are asked to log in; signed-in users without internet
 * are told what still works.
 */
export function useRequireAccount() {
  const { isOffline, exitOffline } = useAuth();
  const online = useOnline();
  return useCallback(
    (go: () => void, feature = 'This feature') => {
      if (isOffline) {
        confirmAction(`${feature} needs an account`, `Log in or create a free account first. ${KEEP}`, exitOffline, { confirmText: 'Log in or sign up', icon: 'user' });
        return;
      }
      if (!online) {
        notify('You’re offline', `${feature} needs internet. ${OFFLINE_OK}`);
        return;
      }
      go();
    },
    [isOffline, exitOffline, online],
  );
}

/** Full-screen "log in first" for online-only screens opened in offline mode. */
export function AccountGate({ feature, back = true }: { feature: string; back?: boolean }) {
  const { exitOffline } = useAuth();
  return (
    <Screen back={back} tabs={!back} title={feature} narrow>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
        <Mascot size={100} mood="happy" pose="coin" />
        <Text variant="h2" center>
          Log in to use {feature}
        </Text>
        <Text tone="muted" center style={{ maxWidth: 380 }}>
          You’re using Paluwagan offline. {WHY}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
          <Button title="Log in or create account" icon="user" onPress={exitOffline} />
          {back && <Button title="Go back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
        </View>
        <Text variant="caption" tone="faint" center>
          {KEEP}
        </Text>
      </Card>
    </Screen>
  );
}

/** Full-screen notice for online-only screens opened by a signed-in user without internet. */
export function ConnectionGate({ feature, back = true }: { feature: string; back?: boolean }) {
  const c = useColors();
  return (
    <Screen back={back} tabs={!back} title={feature} narrow>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }}>
          <Feather name="wifi-off" size={28} color={c.textMuted} />
        </View>
        <Text variant="h2" center>
          You’re offline
        </Text>
        <Text tone="muted" center style={{ maxWidth: 380 }}>
          {feature} needs internet. {OFFLINE_OK}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
          <Button title="Try again" icon="refresh-cw" onPress={() => void checkConnection()} />
          {back && <Button title="Go back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
        </View>
      </Card>
    </Screen>
  );
}

/** Wrap an online-only screen: offline-mode users must log in; no internet shows ConnectionGate. */
export function withAccount<P extends object>(Inner: ComponentType<P>, feature: string, opts: { back?: boolean } = {}) {
  function Gated(props: P) {
    const { isOffline } = useAuth();
    const online = useOnline();
    if (isOffline) return <AccountGate feature={feature} back={opts.back ?? true} />;
    if (!online) return <ConnectionGate feature={feature} back={opts.back ?? true} />;
    return <Inner {...props} />;
  }
  return Gated;
}
