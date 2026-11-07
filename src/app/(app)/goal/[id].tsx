import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { DepositSheet } from '@/components/ipon/DepositSheet';
import { statusChip } from '@/components/ipon/GoalRow';
import { GoalSheet } from '@/components/GoalSheet';
import { Mascot } from '@/components/Mascot';
import { Chip, EmptyState, IconButton, ProgressRing, PurposeIcon } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Confetti } from '@/components/ui/Confetti';
import { PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useAiContext, useAiPlan } from '@/lib/ai';
import { confirmAction, notifyError } from '@/lib/alert';
import { useDeleteDeposit, useDeposits, useGoals, useMyCircles, useSaveGoal } from '@/lib/api';
import { dateTime, longDate, peso } from '@/lib/format';
import { goalProgress, planLabel, planPer, projectedFinish } from '@/lib/ipon';
import { useColors } from '@/lib/prefs';
import { reactToDeposit } from '@/lib/reactions';
import { radius } from '@/theme/tokens';

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'brand' }) {
  const c = useColors();
  return (
    <View style={[styles.fact, { backgroundColor: c.surfaceAlt }]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodyBold" tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export default function GoalDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goals = useGoals();
  const deposits = useDeposits();
  const circles = useMyCircles();
  const save = useSaveGoal();
  const delDeposit = useDeleteDeposit();
  const aiPlan = useAiPlan();
  const context = useAiContext();
  const [edit, setEdit] = useState(false);
  const [sheet, setSheet] = useState<'deposit' | 'withdraw' | null>(null);
  const [party, setParty] = useState(0);

  const goal = goals.data?.find((g) => g.id === id);
  if (!goal) {
    return (
      <Screen back>
        {goals.isLoading ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} />
        ) : (
          <EmptyState icon="target" title="Goal not found" body="It may have been deleted.">
            <Button title="Back to Ipon" onPress={() => router.replace('/ipon')} />
          </EmptyState>
        )}
      </Screen>
    );
  }

  const p = goalProgress(goal, deposits.data ?? [], circles.data ?? []);
  const finish = projectedFinish(p);
  const chip = statusChip[p.status];
  const freq = goal.plan_frequency ?? 'weekly';

  const askPlan = () =>
    aiPlan.mutate({ goal: { title: goal.title, target: Number(goal.target), saved: p.saved, deadline: goal.deadline }, context });
  const applyPlan = () => {
    const plan = aiPlan.data;
    if (!plan) return;
    save.mutate(
      { id: goal.id, title: goal.title, target: Number(goal.target), emoji: goal.emoji, circle_id: goal.circle_id, deadline: plan.deadline, plan_amount: plan.amount, plan_frequency: plan.frequency },
      { onSuccess: () => aiPlan.reset(), onError: (e) => notifyError(e, 'Couldn’t apply plan') },
    );
  };

  const header = (
    <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
      <ProgressRing size={150} stroke={12} progress={p.progress} color={p.status === 'done' ? c.success : c.brand}>
        <View style={[styles.bigIcon, { backgroundColor: c.goldSoft }]}>
          <PurposeIcon icon={goal.emoji} size={26} color={c.gold} />
        </View>
        <Text variant="h2" style={{ marginTop: 6 }}>
          {Math.round(p.progress * 100)}%
        </Text>
      </ProgressRing>
      <Text variant="h1" center>
        {goal.title}
      </Text>
      <Text tone="muted" center>
        <Text variant="bodyBold">{peso(p.saved)}</Text> saved of {peso(goal.target)}
      </Text>
      <Chip label={chip.label} tone={chip.tone} style={{ alignSelf: 'center' }} />
      <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 }}>
        <Button title="Add ipon" icon="plus" variant="brand" onPress={() => setSheet('deposit')} style={{ flex: 1 }} />
        <Button title="Withdraw" icon="minus" variant="secondary" onPress={() => setSheet('withdraw')} style={{ flex: 1 }} disabled={p.ipon <= 0} />
      </View>
    </Card>
  );

  const facts = (
    <Card style={{ gap: 12 }}>
      <View style={styles.titleRow}>
        <Text variant="h3">Plan</Text>
        <PressableScale onPress={() => setEdit(true)} hapticOnPress={false}>
          <Text variant="smallBold" tone="brand">
            Edit
          </Text>
        </PressableScale>
      </View>
      <View style={styles.facts}>
        <Fact label="Savings plan" value={goal.plan_amount ? `${peso(goal.plan_amount)} ${planLabel[freq].toLowerCase()}` : 'Not set'} />
        <Fact label="Target date" value={goal.deadline ? longDate(goal.deadline) : 'Not set'} />
        <Fact label="Left to save" value={peso(p.remaining)} />
        {p.needed !== null && p.remaining > 0 && <Fact label={`Needed ${planPer[freq]}`} value={peso(p.needed)} tone={p.status === 'behind' ? 'warning' : 'brand'} />}
        {goal.plan_amount && <Fact label={`Saved this ${freq === 'daily' ? 'day' : freq === 'monthly' ? 'month' : freq === 'kinsenas' ? 'pay period' : 'week'}`} value={`${peso(p.thisPeriod)} / ${peso(goal.plan_amount)}`} />}
        {finish && <Fact label="Finish at this pace" value={longDate(finish)} />}
        {p.circleName && <Fact label={`From ${p.circleName}`} value={peso(p.fromCircle)} />}
      </View>
    </Card>
  );

  const ai = (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Mascot size={56} mood={aiPlan.data ? 'excited' : 'happy'} pose="coin" />
        <View style={{ flex: 1 }}>
          <Text variant="h3">Smart plan</Text>
          <Text variant="small" tone="muted">
            Ipon fits a plan around your paluwagan dues and paydays.
          </Text>
        </View>
      </View>
      {aiPlan.error && <Text variant="small" tone="danger">{aiPlan.error.message}</Text>}
      {aiPlan.data ? (
        <View style={[styles.plan, { backgroundColor: c.brandSoft }]}>
          <Text variant="h2" tone="brand">
            {peso(aiPlan.data.amount)} {planPer[aiPlan.data.frequency]}
          </Text>
          <Text variant="smallBold" tone="brand">
            Until {longDate(aiPlan.data.deadline)}
          </Text>
          <Text variant="small" style={{ lineHeight: 19 }}>
            {aiPlan.data.summary}
          </Text>
          {aiPlan.data.tips.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Feather name="check" size={14} color={c.brand} style={{ marginTop: 2 }} />
              <Text variant="small" style={{ flex: 1, lineHeight: 19 }}>
                {t}
              </Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button title="Apply plan" icon="check" size="md" onPress={applyPlan} loading={save.isPending} style={{ flex: 1 }} />
            <Button title="Try again" icon="refresh-cw" size="md" variant="secondary" onPress={askPlan} loading={aiPlan.isPending} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button title={aiPlan.isPending ? 'Ipon is thinking…' : 'Ask Ipon for a plan'} icon="zap" variant="secondary" onPress={askPlan} loading={aiPlan.isPending} />
      )}
    </Card>
  );

  const history = (
    <Card padded={false}>
      <View style={{ padding: 18, paddingBottom: 10 }}>
        <Text variant="h3">History</Text>
      </View>
      {p.deposits.length === 0 ? (
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          No entries yet. Tap “Add ipon” to log your first hulog.
        </Text>
      ) : (
        p.deposits.map((d) => {
          const plus = d.amount > 0;
          return (
            <View key={d.id} style={[styles.row, { borderTopColor: c.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: plus ? c.brandSoft : c.surfaceAlt }]}>
                <Feather name={plus ? 'arrow-down-left' : 'arrow-up-right'} size={16} color={plus ? c.brand : c.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {d.note || (plus ? 'Ipon' : 'Withdrawal')}
                </Text>
                <Text variant="caption" tone="faint">
                  {dateTime(d.created_at)}
                </Text>
              </View>
              <Text variant="money" color={plus ? c.success : c.textMuted}>
                {plus ? '+' : '−'}
                {peso(Math.abs(d.amount))}
              </Text>
              <IconButton
                icon="trash-2"
                size={32}
                color={c.textFaint}
                label="Delete entry"
                onPress={() => confirmAction('Delete this entry?', `${plus ? 'Deposit' : 'Withdrawal'} of ${peso(Math.abs(d.amount))}`, () => delDeposit.mutate(d.id, { onError: (e) => notifyError(e) }), { confirmText: 'Delete', destructive: true })}
              />
            </View>
          );
        })
      )}
    </Card>
  );

  return (
    <Screen back refreshing={deposits.isRefetching} onRefresh={() => deposits.refetch()}>
      <Columns
        main={
          <View style={{ gap: 16 }}>
            {header}
            {history}
          </View>
        }
        side={
          <View style={{ gap: 16 }}>
            {facts}
            {ai}
          </View>
        }
      />
      <DepositSheet
        open={!!sheet}
        initial={sheet ?? 'deposit'}
        goal={goal}
        onClose={() => setSheet(null)}
        onSaved={(amt) => {
          reactToDeposit(goal.title, amt, p.saved, Number(goal.target));
          if (amt > 0 && p.saved < Number(goal.target) && p.saved + amt >= Number(goal.target)) setParty((n) => n + 1);
        }}
      />
      <GoalSheet open={edit} goal={goal} saved={p.saved} onClose={() => setEdit(false)} onDeleted={() => router.replace('/ipon')} />
      <Confetti run={party} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexBasis: '46%', flexGrow: 1, padding: 12, borderRadius: radius.md, gap: 2 },
  plan: { padding: 14, borderRadius: radius.md, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1 },
  rowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
