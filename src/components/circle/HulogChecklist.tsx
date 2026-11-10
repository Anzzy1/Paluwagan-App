import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useCircleAction, type CircleDetail } from '@/lib/api';
import { dueOf } from '@/lib/derive';
import { displayStatus, longDate, peso, shortDate, todayISO } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Contribution, Round } from '@/lib/types';
import { radius } from '@/theme/tokens';

/**
 * Hulog checklist for one scheduled hulog date, like the offline paluwagan.
 * The admin marks each member paid (receipt or not) and reviews submitted receipts;
 * members see who has paid and can pay their own hulog.
 */
export function HulogChecklist({
  data,
  round,
  isAdmin,
  userId,
  onPay,
}: {
  data: CircleDetail;
  round: Round;
  isAdmin: boolean;
  userId: string | null;
  onPay: (k: Contribution) => void;
}) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const today = todayISO();
  const roundById = new Map(data.rounds.map((r) => [r.id, r]));
  const roundOf = (k: Contribution) => roundById.get(k.round_id) ?? round;
  const due = (k: Contribution) => dueOf(k, roundOf(k));
  // This round's hulog, plus hulog still running for a sahod that was advanced (released before its dates).
  const ks = data.contributions.filter((k) => k.round_id === round.id || (roundById.get(k.round_id)?.status === 'completed' && due(k) >= today));
  const dates = [...new Set(ks.map(due))].sort();
  // Today if it's a hulog day, else the latest past date, else the first one.
  const fallback = dates.includes(today) ? today : ([...dates].reverse().find((d) => d <= today) ?? dates[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && dates.includes(picked) ? picked : fallback;
  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const rows = ks
    .filter((k) => due(k) === date)
    .sort((a, b) => (memberById.get(a.member_id)?.profiles?.full_name ?? '').localeCompare(memberById.get(b.member_id)?.profiles?.full_name ?? ''));
  const paid = rows.filter((k) => k.status === 'confirmed');
  if (!date || !rows.length) return null;
  const advanced = rows[0].round_id !== round.id ? roundOf(rows[0]) : null;

  const markPaid = (k: Contribution) => {
    const name = memberById.get(k.member_id)?.profiles?.full_name ?? 'this member';
    confirmAction(
      k.user_id === userId ? 'Record your own hulog?' : `Mark ${name} as paid?`,
      `${peso(k.amount)} for ${longDate(date)}. Use this when the money reached you, even without a receipt. Everyone sees it in Activity.`,
      () =>
        action.mutate(
          { fn: 'review_contribution', args: { p_contribution: k.id, p_approve: true, p_reason: null } },
          { onSuccess: () => haptic('success'), onError: (e) => notifyError(e, 'Couldn’t mark as paid') },
        ),
      { confirmText: 'Mark paid', icon: 'check-circle' },
    );
  };

  return (
    <Card padded={false}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="h3">Hulog · {date === today ? 'today' : shortDate(date)}</Text>
          <Text variant="small" tone="muted">
            {paid.length} of {rows.length} paid · {peso(paid.reduce((s, k) => s + Number(k.amount), 0))} collected
            {advanced ? ` · for round ${advanced.round_no}’s advance sahod` : ''}
          </Text>
        </View>
      </View>
      {dates.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
          {dates.map((d) => {
            const on = d === date;
            const dayKs = ks.filter((k) => due(k) === d);
            const done = dayKs.every((k) => k.status === 'confirmed');
            return (
              <PressableScale key={d} onPress={() => setPicked(d)} hapticOnPress={false} style={[styles.date, { backgroundColor: on ? c.ink : c.surfaceAlt }]}>
                <Text variant="caption" color={on ? c.onInk : c.textMuted}>
                  {d === today ? 'Today' : shortDate(d)}
                </Text>
                {done && <Feather name="check" size={12} color={on ? c.onInk : c.success} />}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
      {rows.map((k) => {
        const m = memberById.get(k.member_id);
        const mine = k.user_id === userId;
        const unpaid = k.status === 'pending' || k.status === 'rejected';
        return (
          <View key={k.id} style={[styles.row, { borderTopColor: c.border }]}>
            <Avatar name={m?.profiles?.full_name} seed={k.user_id} uri={m?.profiles?.avatar_url} size={34} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {m?.profiles?.full_name ?? 'Member'}
                {mine ? ' (you)' : ''}
              </Text>
              <Text variant="small" tone="muted">
                {peso(k.amount)}
                {k.status === 'confirmed' && !k.proof_path ? ' · marked by admin' : ''}
              </Text>
            </View>
            {k.status === 'confirmed' ? (
              <StatusChip status="confirmed" />
            ) : isAdmin ? (
              k.status === 'submitted' ? (
                <Button title="Review" size="sm" variant="secondary" full={false} onPress={() => router.push(`/circle/${data.circle.id}/round/${k.round_id}`)} />
              ) : (
                <Button title="Mark paid" size="sm" full={false} onPress={() => markPaid(k)} loading={action.isPending} />
              )
            ) : mine && unpaid ? (
              <Button title="Pay" size="sm" full={false} onPress={() => onPay(k)} />
            ) : (
              <StatusChip status={displayStatus(k, roundOf(k), data.circle)} />
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  dates: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 30, borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
});
