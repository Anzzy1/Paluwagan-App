import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useCircleAction, type CircleDetail } from '@/lib/api';
import { recipientsOf } from '@/lib/derive';
import { peso, slotName } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Contribution, Round } from '@/lib/types';

const sum = (ks: Contribution[]) => ks.reduce((s, k) => s + Number(k.amount), 0);

/** Advanced sahod (0021) where part of the sahod is still owed to the recipient. */
export function sahodBalances(rounds: Round[], contributions: Contribution[]) {
  return rounds.flatMap((r) => {
    if (r.status !== 'completed' || r.advance_given == null || r.balance_released_at) return [];
    const ks = contributions.filter((k) => k.round_id === r.id);
    const pot = sum(ks);
    const given = Number(r.advance_given);
    if (pot <= given) return [];
    const got = sum(ks.filter((k) => k.status === 'confirmed'));
    return [{ round: r, pot, given, owed: pot - given, collected: got, ready: got >= pot }];
  });
}

export function SahodBalances({ data, isAdmin, mySlotGroup }: { data: CircleDetail; isAdmin: boolean; mySlotGroup?: string | null }) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const list = sahodBalances(data.rounds, data.contributions);
  if (!list.length) return null;

  return (
    <Card padded={false}>
      <View style={[styles.head, { backgroundColor: c.goldSoft }]}>
        <Feather name="clock" size={18} color={c.warning} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">Sahod balance owed</Text>
          <Text variant="caption" tone="muted">
            Part of an advance sahod still to hand over
          </Text>
        </View>
      </View>
      {list.map((b) => {
        const mine = !!mySlotGroup && b.round.slot_group === mySlotGroup;
        const name = mine ? 'You' : slotName(recipientsOf(b.round, data.members));
        const give = () =>
          confirmAction(
            `Give ${mine ? 'yourself' : name} the balance?`,
            `${peso(b.owed)} (${peso(b.pot)} sahod, ${peso(b.given)} given early).${
              b.ready ? '' : ` ${peso(b.pot - b.collected)} of this sahod’s hulog isn’t confirmed yet.`
            } Everyone will see it in Activity.`,
            () =>
              action.mutate(
                { fn: 'release_sahod_balance', args: { p_circle: data.circle.id, p_round: b.round.id } },
                { onSuccess: () => haptic('success'), onError: (e) => notifyError(e, 'Couldn’t give the balance') },
              ),
            { confirmText: `Give ${peso(b.owed)}`, icon: 'gift' },
          );
        return (
          <View key={b.round.id} style={[styles.row, { borderTopColor: c.border }]}>
            <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {name} · {peso(b.owed)}
              </Text>
              <Text variant="caption" tone="faint">
                Round {b.round.round_no} · got {peso(b.given)} of {peso(b.pot)} · hulog {peso(b.collected)} of {peso(b.pot)} in
              </Text>
            </View>
            {isAdmin && (
              <Button title="Give balance" icon="gift" size="sm" variant={b.ready ? 'brand' : 'secondary'} full={false} loading={action.isPending} onPress={give} />
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
});
