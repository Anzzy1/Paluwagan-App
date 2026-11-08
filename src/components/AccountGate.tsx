import { router } from 'expo-router';
import { useCallback, type ComponentType } from 'react';
import { View } from 'react-native';

import { Mascot } from '@/components/Mascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { confirmAction } from '@/lib/alert';
import { useAuth } from '@/lib/auth';

const WHY = 'Online paluwagan, joining with an invite, Ipon goals and Ask Ipon need an account so your data is saved and shared with your members.';
const KEEP = 'Your offline paluwagan stay on this device.';

/**
 * Run `go` only when the user has an account. Offline users get an in-app prompt
 * to log in or create one instead.
 */
export function useRequireAccount() {
  const { isOffline, exitOffline } = useAuth();
  return useCallback(
    (go: () => void, feature = 'This feature') => {
      if (!isOffline) return go();
      confirmAction(`${feature} needs an account`, `Log in or create a free account first. ${KEEP}`, exitOffline, { confirmText: 'Log in or sign up', icon: 'user' });
    },
    [isOffline, exitOffline],
  );
}

/** Full-screen "log in first" for online-only screens opened while offline. */
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

/** Wrap an online-only screen: offline users see AccountGate instead. */
export function withAccount<P extends object>(Inner: ComponentType<P>, feature: string, opts: { back?: boolean } = {}) {
  function Gated(props: P) {
    const { isOffline } = useAuth();
    if (isOffline) return <AccountGate feature={feature} back={opts.back ?? true} />;
    return <Inner {...props} />;
  }
  return Gated;
}
