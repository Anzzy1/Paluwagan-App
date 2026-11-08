import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CircleCard } from '@/components/circle/CircleCard';
import { DeletedHistory } from '@/components/circle/DeletedHistory';
import { useRequireAccount } from '@/components/AccountGate';
import { ManagedCard } from '@/components/ManagedCard';
import { EmptyState, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useDeletedCircles, useMyCircles } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useManagedCircles } from '@/lib/local';
import { useIsDesktop, useT } from '@/lib/prefs';

export default function CirclesTab() {
  const t = useT();
  const desktop = useIsDesktop();
  const q = useMyCircles();
  const { isOffline } = useAuth();
  const requireAccount = useRequireAccount();
  const deleted = useDeletedCircles().data ?? [];
  const [filter, setFilter] = useState<'ongoing' | 'done' | 'deleted'>('ongoing');
  const all = q.data ?? [];
  const list = filter === 'deleted' ? [] : all.filter((mc) => (filter === 'done' ? mc.circle.status === 'completed' : mc.circle.status !== 'completed'));
  const managedAll = useManagedCircles();
  const managed = filter === 'deleted' ? [] : managedAll.filter((m) => (filter === 'done' ? m.status === 'completed' : m.status !== 'completed'));

  const actions = (
    <>
      <Button title={t('circles.join')} icon="log-in" size="md" variant="secondary" full={false} style={desktop ? undefined : { flex: 1, paddingHorizontal: 12 }} onPress={() => requireAccount(() => router.push('/join'), 'Joining a paluwagan')} />
      <Button title={t('circles.create')} icon="plus" size="md" full={false} style={desktop ? undefined : { flex: 1, paddingHorizontal: 12 }} onPress={() => router.push('/create')} />
    </>
  );

  return (
    <Screen tabs title={t('circles.title')} subtitle={isOffline ? `${managedAll.length} managed on this device · offline mode` : `${all.length} online · ${managedAll.length} managed on this device`} right={desktop ? actions : undefined} refreshing={q.isRefetching} onRefresh={q.refetch}>
      {!desktop && <View style={{ flexDirection: 'row', gap: 10 }}>{actions}</View>}
      <View style={{ maxWidth: 420 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ongoing', label: 'Active' },
            { value: 'done', label: 'Completed' },
            // Deleted history only appears once there's something in it.
            ...(deleted.length || filter === 'deleted' ? [{ value: 'deleted' as const, label: `Deleted${deleted.length ? ` (${deleted.length})` : ''}` }] : []),
          ]}
        />
      </View>
      {filter === 'deleted' ? (
        <DeletedHistory items={deleted} />
      ) : list.length === 0 && managed.length === 0 && !q.isLoading ? (
        <Card>
          <EmptyState
            icon={filter === 'done' ? 'flag' : 'layers'}
            title={filter === 'done' ? 'No completed paluwagan' : t('home.noCircles')}
            body={filter === 'done' ? 'Paluwagan you finish will appear here.' : t('home.noCirclesBody')}
          />
        </Card>
      ) : (
        <View style={desktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : { gap: 16 }}>
          {list.map((mc) => (
            <View key={mc.circle.id} style={desktop ? { flexBasis: '48%', flexGrow: 1, maxWidth: '50%' } : undefined}>
              <CircleCard mc={mc} />
            </View>
          ))}
          {managed.map((m) => (
            <View key={m.id} style={desktop ? { flexBasis: '48%', flexGrow: 1, maxWidth: '50%' } : undefined}>
              <ManagedCard circle={m} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
