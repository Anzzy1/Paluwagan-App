import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CircleCard } from '@/components/circle/CircleCard';
import { EmptyState, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useMyCircles } from '@/lib/api';
import { useT } from '@/lib/prefs';

export default function CirclesTab() {
  const t = useT();
  const q = useMyCircles();
  const [filter, setFilter] = useState<'ongoing' | 'done'>('ongoing');
  const list = (q.data ?? []).filter((mc) =>
    filter === 'done' ? mc.circle.status === 'completed' : mc.circle.status !== 'completed',
  );

  return (
    <Screen tabs title={t('circles.title')} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={t('circles.create')} icon="plus" size="md" onPress={() => router.push('/create')} style={{ flex: 1 }} />
        <Button title={t('circles.join')} icon="key" size="md" variant="secondary" onPress={() => router.push('/join')} style={{ flex: 1 }} />
      </View>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'ongoing', label: 'Kasalukuyan' },
          { value: 'done', label: 'Tapos na' },
        ]}
      />
      {list.length === 0 && !q.isPending ? (
        <Card>
          <EmptyState
            emoji={filter === 'done' ? '🏁' : '🫙'}
            title={filter === 'done' ? 'Wala pang natapos' : t('home.noCircles')}
            body={filter === 'done' ? 'Dito lalabas ang mga paluwagang natapos mo na.' : t('home.noCirclesBody')}
          />
        </Card>
      ) : (
        list.map((mc, i) => (
          <Animated.View key={mc.circle.id} entering={FadeInDown.delay(i * 60)}>
            <CircleCard mc={mc} />
          </Animated.View>
        ))
      )}
    </Screen>
  );
}
