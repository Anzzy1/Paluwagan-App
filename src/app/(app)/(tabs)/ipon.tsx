import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GoalSheet } from '@/components/GoalSheet';
import { GoalRow } from '@/components/ipon/GoalRow';
import { InsightBand } from '@/components/InsightBand';
import { EmptyState, iconOf } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDeposits, useGoals, useMyCircles } from '@/lib/api';
import { peso, timeAgo } from '@/lib/format';
import { goalProgress, iponStreak } from '@/lib/ipon';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="overline" color="rgba(255,255,255,0.75)">
        {label}
      </Text>
      <Text variant="h2" color="#fff" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export default function Ipon() {
  const c = useColors();
  const desktop = useIsDesktop();
  const goals = useGoals();
  const deposits = useDeposits();
  const circles = useMyCircles();
  const [sheet, setSheet] = useState(false);

  const deps = deposits.data ?? [];
  const list = (goals.data ?? []).map((g) => goalProgress(g, deps, circles.data ?? []));
  const total = list.reduce((s, p) => s + p.saved, 0);
  const targetSum = list.reduce((s, p) => s + Number(p.goal.target), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = deps.filter((d) => d.amount > 0 && new Date(d.created_at).getTime() >= monthStart).reduce((s, d) => s + Number(d.amount), 0);
  const streak = iponStreak(deps);
  const titleOf = new Map((goals.data ?? []).map((g) => [g.id, g]));

  const hero = (
    <LinearGradient colors={['#1DB45A', '#0F7F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={[styles.deco, { right: -40, top: -60 }]} />
      <View style={[styles.deco, { left: -30, bottom: -120, width: 200, height: 200 }]} />
      <Text variant="overline" color="rgba(255,255,255,0.8)">
        Total ipon
      </Text>
      <Text variant="hero" color="#fff">
        {peso(total)}
      </Text>
      <Text variant="small" color="rgba(255,255,255,0.8)">
        {targetSum > 0 ? `${Math.round((total / targetSum) * 100)}% of ${peso(targetSum)} across ${list.length} goal${list.length === 1 ? '' : 's'}` : 'Start a goal and save at your own pace'}
      </Text>
      <View style={[styles.heroStats, { borderTopColor: 'rgba(255,255,255,0.18)' }]}>
        <HeroStat label="This month" value={peso(thisMonth)} />
        <HeroStat label="Weekly streak" value={`${streak} wk${streak === 1 ? '' : 's'}`} />
        <HeroStat label="Goals" value={String(list.length)} />
      </View>
    </LinearGradient>
  );

  const goalsCard = (
    <Card style={{ gap: 18 }}>
      <View style={styles.titleRow}>
        <Text variant="h3">My goals</Text>
        <PressableScale onPress={() => setSheet(true)} hapticOnPress={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="plus" size={15} color={c.brand} />
          <Text variant="smallBold" tone="brand">
            New goal
          </Text>
        </PressableScale>
      </View>
      {list.map((p) => (
        <GoalRow key={p.goal.id} p={p} />
      ))}
    </Card>
  );

  const history = (
    <Card padded={false}>
      <View style={{ padding: 18, paddingBottom: 10 }}>
        <Text variant="h3">Recent ipon</Text>
      </View>
      {deps.length === 0 ? (
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          Your deposits and withdrawals will show up here.
        </Text>
      ) : (
        deps.slice(0, 8).map((d) => {
          const g = titleOf.get(d.goal_id);
          const plus = d.amount > 0;
          return (
            <PressableScale key={d.id} onPress={() => router.push(`/goal/${d.goal_id}` as Href)} hapticOnPress={false} scaleTo={0.99} style={[styles.row, { borderTopColor: c.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: plus ? c.brandSoft : c.surfaceAlt }]}>
                <Feather name={plus ? iconOf(g?.emoji) : 'arrow-up-right'} size={16} color={plus ? c.brand : c.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {d.note || (plus ? 'Ipon' : 'Withdrawal')}
                </Text>
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {g?.title ?? 'Goal'} · {timeAgo(d.created_at)}
                </Text>
              </View>
              <Text variant="money" color={plus ? c.success : c.textMuted}>
                {plus ? '+' : '−'}
                {peso(Math.abs(d.amount))}
              </Text>
            </PressableScale>
          );
        })
      )}
    </Card>
  );

  const empty = (
    <Card>
      <EmptyState icon="target" title="Start your ipon" body="Save on your own for an emergency fund, tuition or a new phone. Set a target, choose a plan, and log every hulog.">
        <Button title="Create a goal" icon="plus" onPress={() => setSheet(true)} />
      </EmptyState>
    </Card>
  );

  return (
    <Screen
      tabs
      title="Ipon"
      subtitle="Your personal savings goals"
      right={<Button title="New goal" icon="plus" size="sm" full={false} onPress={() => setSheet(true)} />}
      refreshing={goals.isRefetching || deposits.isRefetching}
      onRefresh={() => {
        goals.refetch();
        deposits.refetch();
      }}>
      {desktop ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.4, gap: 16 }}>
            {hero}
            {list.length ? goalsCard : empty}
          </View>
          <View style={{ flex: 1, gap: 16 }}>
            <InsightBand />
            {history}
          </View>
        </View>
      ) : (
        <>
          {hero}
          <InsightBand />
          {list.length ? goalsCard : empty}
          {history}
        </>
      )}
      <GoalSheet open={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22, gap: 4, overflow: 'hidden' },
  deco: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStats: { flexDirection: 'row', gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1 },
  rowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
