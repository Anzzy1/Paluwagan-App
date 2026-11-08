import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { timeAgo } from '@/lib/format';
import { markNotificationsSeen, useNotifications, type AppNotification, type AppUpdate } from '@/lib/notifications';
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

function UpdateRow({ u, unread }: { u: AppUpdate; unread: boolean }) {
  const c = useColors();
  const fg = { danger: c.danger, warning: c.warning, success: c.success, info: c.info, neutral: c.textMuted, brand: c.brand }[u.tone];
  const bg = { danger: c.dangerBg, warning: c.warningBg, success: c.successBg, info: c.infoBg, neutral: c.surfaceAlt, brand: c.brandSoft }[u.tone];
  return (
    <PressableScale onPress={() => router.push(u.href)} hapticOnPress={false} scaleTo={0.99} style={[styles.update, { borderTopColor: c.border }, unread && { backgroundColor: c.brandSoft }]}>
      <View style={[styles.smallIcon, { backgroundColor: bg }]}>
        <Feather name={u.icon} size={15} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={unread ? 'bodyBold' : 'bodyMedium'} style={{ fontSize: 14, lineHeight: 20 }}>
          {u.text}
        </Text>
        <Text variant="caption" tone="faint">
          {u.circle} · {timeAgo(u.at)}
        </Text>
      </View>
      {unread && <View style={[styles.dot, { backgroundColor: c.brand }]} />}
    </PressableScale>
  );
}

export default function Notifications() {
  const { items, updates, seenAt, refreshing, refresh } = useNotifications();
  const now = items.filter((x) => x.action);
  const soon = items.filter((x) => !x.action);
  // Keep showing what was new when the screen opened, then mark everything as seen.
  const [seenBefore] = useState(seenAt);
  useEffect(() => {
    markNotificationsSeen();
    return () => markNotificationsSeen();
  }, []);

  return (
    <Screen back title="Notifications" subtitle="What needs your attention, what’s coming up, and what others did." refreshing={refreshing} onRefresh={refresh}>
      <View style={{ maxWidth: 760, gap: 18 }}>
        {!items.length && !updates.length && (
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
        {!!updates.length && (
          <View style={{ gap: 10 }}>
            <Text variant="overline" tone="muted">
              Updates
            </Text>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {updates.slice(0, 30).map((u, i) => (
                <View key={u.id} style={i === 0 ? { marginTop: -1 } : undefined}>
                  <UpdateRow u={u} unread={u.at > seenBefore} />
                </View>
              ))}
            </Card>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  update: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
  smallIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
