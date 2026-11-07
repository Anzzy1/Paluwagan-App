import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Chip, type ChipTone, ProgressBar, PurposeIcon } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { peso, shortDate } from '@/lib/format';
import { planPer, type GoalProgress } from '@/lib/ipon';
import { useColors } from '@/lib/prefs';

export const statusChip: Record<GoalProgress['status'], { label: string; tone: ChipTone }> = {
  done: { label: 'Goal reached!', tone: 'success' },
  'on-track': { label: 'On track', tone: 'brand' },
  behind: { label: 'Behind plan', tone: 'warning' },
  overdue: { label: 'Past target date', tone: 'danger' },
  'no-plan': { label: 'No plan yet', tone: 'neutral' },
};

/** Compact goal progress row, used on Home and the Ipon tab. */
export function GoalRow({ p }: { p: GoalProgress }) {
  const c = useColors();
  const g = p.goal;
  const sub = [
    g.plan_amount && g.plan_frequency ? `${peso(g.plan_amount)} ${planPer[g.plan_frequency]}` : null,
    g.deadline ? `by ${shortDate(g.deadline)}` : null,
    p.circleName ? `+ ${p.circleName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const chip = statusChip[p.status];
  return (
    <PressableScale onPress={() => router.push(`/goal/${g.id}` as Href)} hapticOnPress={false} scaleTo={0.99} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.icon, { backgroundColor: p.status === 'done' ? c.successBg : c.goldSoft }]}>
          <PurposeIcon icon={g.emoji} size={17} color={p.status === 'done' ? c.success : c.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold" numberOfLines={1}>
            {g.title}
          </Text>
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {sub || 'Tap to set a plan'}
          </Text>
        </View>
        <Text variant="smallBold" tone="brand">
          {Math.round(p.progress * 100)}%
        </Text>
      </View>
      <ProgressBar progress={p.progress} height={8} color={p.status === 'done' ? c.success : undefined} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" tone="muted">
          {peso(p.saved)} of {peso(g.target)}
        </Text>
        <Chip label={chip.label} tone={chip.tone} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
