import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar, Chip, type ChipTone } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCircle, useCircleAction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { longDate, shortDate, slotName } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Swap } from '@/lib/types';
import { radius } from '@/theme/tokens';

const STATUS: Record<Swap['status'], { label: string; tone: ChipTone }> = {
  pending: { label: 'Awaiting response', tone: 'neutral' },
  accepted: { label: 'Awaiting admin approval', tone: 'info' },
  declined: { label: 'Declined', tone: 'danger' },
  approved: { label: 'Completed', tone: 'success' },
  rejected: { label: 'Rejected by admin', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function Swaps() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { userId } = useAuth();
  const q = useCircle(id);
  const action = useCircleAction(id);
  const [target, setTarget] = useState<string | null>(null);

  if (!q.data) {
    return (
      <Screen back>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  const { members, rounds, swaps } = q.data;
  const me = members.find((m) => m.user_id === userId)!;
  const isAdmin = me.role === 'admin';
  const roundOf = (group: string) => rounds.find((r) => r.slot_group === group);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const groupName = (g: string) => slotName(members.filter((m) => m.slot_group === g && m.status === 'approved'));
  const myRound = roundOf(me.slot_group);
  const canSwapMine = myRound?.status === 'upcoming';
  const hasOpen = swaps.some(
    (s) => (s.status === 'pending' || s.status === 'accepted') && [s.from_member, s.to_member].some((x) => memberById.get(x)?.slot_group === me.slot_group),
  );
  const candidates = rounds
    .filter((r) => r.status === 'upcoming' && r.slot_group !== me.slot_group)
    .map((r) => ({ round: r, member: members.find((m) => m.slot_group === r.slot_group && m.status === 'approved')! }))
    .filter((x) => x.member);

  const act = (fn: string, args: Record<string, unknown>, after?: () => void) => action.mutate({ fn, args }, { onSuccess: after, onError: (e) => notifyError(e) });

  const requests = (
    <Card padded={false}>
      <View style={styles.head}>
        <Text variant="h3">Requests</Text>
      </View>
      {swaps.length === 0 ? (
        <View style={[styles.rowPad, { borderTopColor: c.border, borderTopWidth: 1 }]}>
          <Text variant="small" tone="muted">
            No swap requests yet.
          </Text>
        </View>
      ) : (
        swaps.map((s) => {
          const from = memberById.get(s.from_member);
          const to = memberById.get(s.to_member);
          if (!from || !to) return null;
          const iAmTo = to.user_id === userId;
          const iAmFrom = from.user_id === userId;
          const st = STATUS[s.status];
          return (
            <View key={s.id} style={[styles.rowPad, { borderTopColor: c.border, borderTopWidth: 1, gap: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={from.profiles?.full_name} seed={from.user_id} uri={from.profiles?.avatar_url} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold" numberOfLines={1}>
                    {groupName(from.slot_group)} (#{roundOf(from.slot_group)?.round_no})
                  </Text>
                  <Text variant="small" tone="muted">
                    wants to swap with {groupName(to.slot_group)} (#{roundOf(to.slot_group)?.round_no})
                  </Text>
                </View>
                <Chip label={st.label} tone={st.tone} />
              </View>
              {s.status === 'pending' && iAmTo && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Decline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'decline' })} />
                  <Button title="Accept" size="sm" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'accept' })} />
                </View>
              )}
              {s.status === 'accepted' && isAdmin && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Reject" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'reject' })} />
                  <Button title="Approve swap" variant="brand" size="sm" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'approve' })} />
                </View>
              )}
              {(s.status === 'pending' || s.status === 'accepted') && iAmFrom && (
                <Button title="Cancel request" variant="ghost" size="sm" full={false} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'cancel' })} />
              )}
            </View>
          );
        })
      )}
    </Card>
  );

  const newRequest = (
    <Card padded={false}>
      <View style={styles.head}>
        <Text variant="h3">Request a swap</Text>
      </View>
      {!canSwapMine || hasOpen || candidates.length === 0 ? (
        <View style={[styles.rowPad, { borderTopColor: c.border, borderTopWidth: 1 }]}>
          <Text variant="small" tone="muted">
            {!canSwapMine
              ? 'Your payout round has already started or finished, so it can’t be swapped.'
              : hasOpen
                ? 'You already have an open request. Wait for it to be resolved first.'
                : 'There are no other upcoming slots to swap with.'}
          </Text>
        </View>
      ) : (
        <>
          {candidates.map(({ round, member }) => {
            const sel = target === member.id;
            return (
              <PressableScale
                key={round.id}
                hapticOnPress={false}
                scaleTo={0.995}
                onPress={() => setTarget(member.id)}
                style={[styles.rowPad, styles.cand, { borderTopColor: c.border }, sel && { backgroundColor: c.brandSoft }]}>
                <Text variant="smallBold" tone="faint" style={{ width: 26 }}>
                  #{round.round_no}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{groupName(round.slot_group)}</Text>
                  <Text variant="small" tone="muted">
                    Payout {shortDate(round.due_date)} · Trust {member.profiles?.tiwala_score}
                  </Text>
                </View>
                <Feather name={sel ? 'check-circle' : 'circle'} size={18} color={sel ? c.brand : c.borderStrong} />
              </PressableScale>
            );
          })}
          <View style={[styles.rowPad, { borderTopColor: c.border, borderTopWidth: 1 }]}>
            <Button title="Send request" icon="repeat" disabled={!target} loading={action.isPending} onPress={() => act('request_swap', { p_circle: id, p_to_member: target }, () => setTarget(null))} />
          </View>
        </>
      )}
    </Card>
  );

  return (
    <Screen
      back
      title="Turn swaps"
      subtitle={myRound ? `Your payout is round ${myRound.round_no} on ${longDate(myRound.due_date)}. Swaps need the other member’s consent and admin approval.` : undefined}
      refreshing={q.isRefetching}
      onRefresh={q.refetch}>
      <Columns main={requests} side={newRequest} sideWidth={400} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingVertical: 14 },
  rowPad: { paddingHorizontal: 16, paddingVertical: 12 },
  cand: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderRadius: radius.xs },
});
