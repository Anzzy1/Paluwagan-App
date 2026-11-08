import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/ui/bits';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useActivity } from '@/lib/api';
import { useManagedCircles } from '@/lib/local';
import type { Activity } from '@/lib/types';
import { useT } from '@/lib/prefs';

export default function ActivityTab() {
  const t = useT();
  const q = useActivity();
  const managed = useManagedCircles();
  // Managed paluwagan keep their log on this device; show it alongside the online activity.
  const local: Activity[] = managed.flatMap((m) =>
    m.log.map((l, i) => ({
      id: m.log.length - i,
      circle_id: m.id,
      actor: null,
      type: 'managed_log',
      payload: { text: l.text },
      created_at: l.at,
      circles: { name: m.name, emoji: m.emoji, color: m.color },
      profiles: null,
    })),
  );
  const items = [...(q.data ?? []), ...local].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Screen
      tabs
      title={t('tab.activity')}
      subtitle="An audit trail of every action across your paluwagan. Entries can’t be edited or deleted."
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
