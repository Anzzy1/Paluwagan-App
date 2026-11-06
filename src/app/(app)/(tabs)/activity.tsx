import { ActivityList } from '@/components/ActivityList';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/bits';
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
      subtitle="Lahat ng galaw sa mga circle mo. Hindi ito nabubura."
      refreshing={q.isRefetching}
      onRefresh={q.refetch}>
      <Card>
        {items.length ? (
          <ActivityList items={items} />
        ) : (
          <EmptyState emoji="📭" title="Tahimik pa dito" body="Lalabas dito ang mga bayad, bunot, at palit-slot." />
        )}
      </Card>
    </Screen>
  );
}
