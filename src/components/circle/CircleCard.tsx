import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Chip, ProgressBar } from '@/components/ui/bits';
import { Card, useTint } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { MyCircle } from '@/lib/api';
import { summarize } from '@/lib/derive';
import { frequencyLabel, peso } from '@/lib/format';
import { useColors, usePrefs, useT } from '@/lib/prefs';

export function CircleCard({ mc }: { mc: MyCircle }) {
  const t = useT();
  const { lang } = usePrefs();
  const c = useColors();
  const tint = useTint(mc.circle.color);
  const s = summarize(mc);
  const { circle } = mc;
  const total = mc.rounds.length || circle.slots;

  return (
    <Card tint={circle.color} onPress={() => router.push(`/circle/${circle.id}`)}>
      <View style={styles.top}>
        <View style={[styles.emoji, { backgroundColor: c.surface }]}>
          <Text style={{ fontSize: 26, lineHeight: 32 }}>{circle.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {circle.name}
          </Text>
          <Text variant="small" tone="muted">
            {peso(circle.amount)} · {frequencyLabel[circle.frequency][lang]}
          </Text>
        </View>
        {mc.membership.role === 'admin' && <Chip label="Admin" tone="ink" />}
      </View>

      <View style={styles.mid}>
        <View>
          <Text variant="caption" tone="muted">
            {t('circle.pot')}
          </Text>
          <Text variant="h1">{peso(s.pot)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="caption" tone="muted">
            {circle.status === 'active' ? 'Slot mo' : 'Status'}
          </Text>
          <Text variant="h2">
            {circle.status === 'active' || circle.status === 'completed'
              ? `#${mc.membership.slot_no ?? '–'}`
              : t(`st.${circle.status}`)}
          </Text>
        </View>
      </View>

      {circle.status === 'active' || circle.status === 'completed' ? (
        <View style={{ gap: 8 }}>
          <ProgressBar progress={s.completedRounds / total} color={tint.strong} />
          <View style={styles.row}>
            <Text variant="smallBold" tone="muted">
              {t('circle.round')} {s.current?.round_no ?? s.completedRounds}/{total}
            </Text>
            {s.roundsAway === 0 ? (
              <Chip label="Ikaw ngayon! 🎉" tone="accent" />
            ) : s.roundsAway != null ? (
              <Text variant="smallBold" tone="muted">
                {s.roundsAway} {t('home.roundsAway')}
              </Text>
            ) : (
              <Text variant="smallBold" tone="success">
                Nakuha mo na ✓
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginVertical: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
