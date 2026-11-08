import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useNotifications, type AppNotification } from '@/lib/notifications';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

function Row({ n }: { n: AppNotification }) {
  const c = useColors();
  const fg = { danger: c.danger, warning: c.warning, success: c.success, info: c.info }[n.tone];
  const bg = { danger: c.dangerBg, warning: c.warningBg, success: c.successBg, info: c.infoBg }[n.tone];
  return (
    <PressableScale onPress={() => router.push(n.href)} hapticOnPress={false} scaleTo={0.99} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Feather name={n.icon} size={18} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {n.circle}
        </Text>
        <Text variant="bodyBold">{n.title}</Text>
        <Text variant="small" tone="muted">
          {n.body}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.textFaint} />
    </PressableScale>
  );
}

export default function Notifications() {
  const { items, refreshing, refresh } = useNotifications();
  const now = items.filter((x) => x.action);
  const soon = items.filter((x) => !x.action);

  return (
    <Screen back title="Notifications" subtitle="What needs your attention. Once it’s handled, it clears from here." refreshing={refreshing} onRefresh={refresh}>
      <View style={{ maxWidth: 760, gap: 18 }}>
        {!items.length && (
          <Card>
            <EmptyState icon="bell" title="You’re all caught up" body="Hulog to pay, payments to review and sahod to release will show up here.">
              <Button title="View activity" icon="list" variant="secondary" full={false} onPress={() => router.push('/activity' as Href)} />
            </EmptyState>
          </Card>
        )}
        {!!now.length && (
          <View style={{ gap: 10 }}>
            <Text variant="overline" tone="muted">
              Needs action
            </Text>
            {now.map((n) => (
              <Row key={n.id} n={n} />
            ))}
          </View>
        )}
        {!!soon.length && (
          <View style={{ gap: 10 }}>
            <Text variant="overline" tone="muted">
              Coming up
            </Text>
            {soon.map((n) => (
              <Row key={n.id} n={n} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
