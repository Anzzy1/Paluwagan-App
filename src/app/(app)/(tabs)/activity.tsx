import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/ui/bits';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useActivity } from '@/lib/api';
import { useT } from '@/lib/prefs';

export default function ActivityTab() {
  const t = useT();
  const q = useActivity();
  const items = q.data ?? [];
  return (
    <Screen
      tabs
      title={t('tab.activity')}
      subtitle="An audit trail of every action across your circles. Entries can’t be edited or deleted."
      refreshing={q.isRefetching}
      onRefresh={q.refetch}>
      <Card style={{ maxWidth: 760 }}>
        {items.length ? (
          <ActivityList items={items} />
        ) : (
          <EmptyState icon="bell" title="No activity yet" body="Payments, draws and turn swaps will appear here." />
        )}
      </Card>
    </Screen>
  );
}
