import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PurgeSheet } from '@/components/circle/Lifecycle';
import { CircleIcon, Divider, EmptyState } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCircleLifecycle, type MyCircle } from '@/lib/api';
import { longDate, peso } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Circle } from '@/lib/types';

/** Paluwagan the admin deleted: restore to continue, or remove for good. */
export function DeletedHistory({ items }: { items: MyCircle[] }) {
  if (!items.length) {
    return (
      <Card>
        <EmptyState icon="trash-2" title="No deleted paluwagan" body="Paluwagan you delete will appear here, so you can restore them later." />
      </Card>
    );
  }
  return (
    <Card style={{ gap: 0, paddingVertical: 6 }}>
      <Text variant="small" tone="muted" style={{ paddingVertical: 8 }}>
        Hidden from members. Restore one to continue where you left off.
      </Text>
      {items.map((mc, i) => (
        <View key={mc.circle.id}>
          {i > 0 && <Divider />}
          <Row circle={mc.circle} />
        </View>
      ))}
    </Card>
  );
}

function Row({ circle }: { circle: Circle }) {
  const c = useColors();
  const life = useCircleLifecycle();
  const [purge, setPurge] = useState(false);
  const restoring = life.restore.isPending && life.restore.variables === circle.id;
  return (
    <View style={styles.row}>
      <PressableScale onPress={() => router.push(`/circle/${circle.id}`)} hapticOnPress={false} scaleTo={0.99} style={styles.info}>
        <CircleIcon icon={circle.emoji} color={circle.color} size={42} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyBold" numberOfLines={1}>
            {circle.name}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {peso(circle.amount)} · Deleted {circle.deleted_at ? longDate(circle.deleted_at.slice(0, 10)) : ''}
          </Text>
        </View>
      </PressableScale>
      <Button
        title="Restore"
        icon="rotate-ccw"
        size="sm"
        variant="secondary"
        full={false}
        loading={restoring}
        onPress={() => life.restore.mutate(circle.id, { onError: (e) => notifyError(e, 'Couldn’t restore') })}
      />
      <PressableScale onPress={() => setPurge(true)} hapticOnPress={false} accessibilityLabel={`Delete ${circle.name} forever`} hitSlop={6} style={[styles.trash, { backgroundColor: c.dangerBg }]}>
        <Feather name="trash-2" size={16} color={c.danger} />
      </PressableScale>
      <PurgeSheet circle={circle} open={purge} onClose={() => setPurge(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trash: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
