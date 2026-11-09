import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PaySheet } from '@/components/circle/PaySheet';
import { Avatar, Chip, Input, ProgressRing, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useCircle, useCircleAction, useReceiptUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dueOf, hulogInRound, myNextContribution, recipientsOf } from '@/lib/derive';
import { displayStatus, longDate, peso, potOf, relativeDue, shortDate, timeAgo } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Contribution, Member } from '@/lib/types';
import { radius } from '@/theme/tokens';
import { withAccount } from '@/components/AccountGate';

function RoundScreenScreen() {
  const { id, roundId } = useLocalSearchParams<{ id: string; roundId: string }>();
  const c = useColors();
  const { userId } = useAuth();
  const q = useCircle(id);
  const [review, setReview] = useState<Contribution | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  if (!q.data) {
    return (
      <Screen back>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  const { circle, members, rounds, contributions } = q.data;
  const round = rounds.find((r) => r.id === roundId);
  if (!round) {
    return (
      <Screen back title="Round not found">
        <View />
      </Screen>
    );
  }
  const me = members.find((m) => m.user_id === userId);
  const recipients = recipientsOf(round, members);
  const isAdmin = me?.role === 'admin';
  const canReview = isAdmin || me?.slot_group === round.slot_group;
  const ks = contributions
    .filter((k) => k.round_id === round.id)
    .sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted') || dueOf(a, round).localeCompare(dueOf(b, round)));
  const perSahod = hulogInRound(contributions, round);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const paid = ks.filter((k) => k.status === 'confirmed');
  const collected = paid.reduce((s, k) => s + Number(k.amount), 0);
  const pot = potOf(circle) * perSahod;
  const myK = myNextContribution(contributions, round, me?.id);
  const pendingReview = ks.filter((k) => k.status === 'submitted').length;

  const summary = (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing size={84} stroke={8} progress={collected / pot} color={c.success}>
          <Text variant="h3">{Math.round((collected / pot) * 100)}%</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            Collected
          </Text>
          <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }}>
            {peso(collected)}
          </Text>
          <Text variant="small" tone="muted">
            of {peso(pot)} · {paid.length}/{ks.length} payments
          </Text>
        </View>
      </Card>
      <Card padded={false}>
        <View style={styles.head}>
          <Text variant="h3">Recipient</Text>
          <Chip label={round.status === 'completed' ? 'Paid out' : round.status === 'active' ? 'Current round' : 'Upcoming'} tone={round.status === 'completed' ? 'success' : round.status === 'active' ? 'brand' : 'neutral'} />
        </View>
        {recipients.map((m) => (
          <View key={m.id} style={[styles.row, { borderTopColor: c.border, borderTopWidth: 1 }]}>
            <Avatar name={m.profiles?.full_name} seed={m.user_id} uri={m.profiles?.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">{m.profiles?.full_name}</Text>
              <Text variant="small" tone="muted">
                {m.profiles?.gcash_number ? `GCash / Maya · ${m.profiles.gcash_number}` : 'No payment number on file'}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      {myK && !myK.auto && (myK.status === 'pending' || myK.status === 'rejected') && (
        <Button title={round.status === 'completed' ? `Pay overdue ${peso(myK.amount)}` : `Pay ${peso(myK.amount)}`} icon="send" onPress={() => setPayOpen(true)} />
      )}
    </>
  );

  const list = (
    <Card padded={false}>
      <View style={styles.head}>
        <Text variant="h3">Contributions</Text>
        {canReview && pendingReview > 0 && <Chip label={`${pendingReview} to review`} tone="info" />}
      </View>
      {ks.map((k) => {
        const m = memberById.get(k.member_id);
        const mine = k.user_id === userId;
        // Nobody confirms their own payment; the admin can open someone's unpaid hulog to cover it.
        const reviewable = canReview && k.status === 'submitted' && !mine;
        const coverable = isAdmin && !mine && !k.auto && (k.status === 'pending' || k.status === 'rejected');
        return (
          <PressableScale
            key={k.id}
            disabled={!reviewable && !coverable && !k.proof_path}
            dimWhenDisabled={false}
            onPress={() => setReview(k)}
            hapticOnPress={false}
            scaleTo={0.995}
            style={[styles.row, { borderTopColor: c.border, borderTopWidth: 1 }, reviewable && { backgroundColor: c.infoBg }]}>
            <Avatar name={m?.profiles?.full_name} seed={m?.user_id} uri={m?.profiles?.avatar_url} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {m?.profiles?.full_name ?? 'Member'}
                {m?.user_id === userId ? ' (you)' : ''}
              </Text>
              <Text variant="small" tone="muted">
                {perSahod > 1 ? `${shortDate(dueOf(k, round))} · ` : ''}
                {k.auto
                  ? 'Recipient’s own share'
                  : k.covered_by
                    ? `${peso(k.amount)} · covered by the organizer`
                    : k.submitted_at
                      ? `${peso(k.amount)} · submitted ${timeAgo(k.submitted_at)}${k.on_time === false ? ' · late' : ''}${Number(k.late_fee) > 0 ? ` · ${peso(k.late_fee)} late fee` : ''}`
                      : peso(k.amount)}
              </Text>
            </View>
            {k.auto ? <Chip label="Recipient" tone="brand" /> : k.covered_by ? <Chip label="Covered" tone="warning" /> : <StatusChip status={displayStatus(k, round, circle)} />}
            {reviewable && <Feather name="chevron-right" size={16} color={c.info} />}
          </PressableScale>
        );
      })}
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen back title={`Payout ${round.round_no}`} subtitle={`${circle.name} · sahod ${longDate(round.due_date)} · ${relativeDue(round.due_date)}${perSahod > 1 ? ` · ${perSahod} hulog` : ''}`} refreshing={q.isRefetching} onRefresh={q.refetch}>
        <Columns main={list} side={summary} />
      </Screen>
      <ReviewSheet k={review} member={review ? memberById.get(review.member_id) : undefined} canReview={!!canReview && review?.user_id !== userId} canCover={!!isAdmin && review?.user_id !== userId} circleId={id} onClose={() => setReview(null)} />
      {myK && <PaySheet open={payOpen} onClose={() => setPayOpen(false)} circle={circle} round={round} contribution={myK} recipients={recipients} />}
    </View>
  );
}

function ReviewSheet({
  k,
  member,
  canReview,
  canCover,
  circleId,
  onClose,
}: {
  k: Contribution | null;
  member?: Member;
  canReview: boolean;
  canCover: boolean;
  circleId: string;
  onClose: () => void;
}) {
  const url = useReceiptUrl(k?.proof_path);
  const action = useCircleAction(circleId);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const close = () => {
    setReason('');
    setRejecting(false);
    onClose();
  };
  const review = (approve: boolean) =>
    k &&
    action.mutate(
      { fn: 'review_contribution', args: { p_contribution: k.id, p_approve: approve, p_reason: approve ? null : reason || null } },
      {
        onSuccess: () => {
          haptic(approve ? 'success' : 'warning');
          close();
        },
        onError: (e) => notifyError(e),
      },
    );

  const unpaidK = !!k && !k.auto && (k.status === 'pending' || k.status === 'rejected');
  const cover = () =>
    k &&
    confirmAction(
      'Cover this hulog?',
      `You’re confirming that you paid ${peso(k.amount)} for ${member?.profiles?.full_name ?? 'this member'}. It counts as paid for the round, and as a missed payment on their Trust Score.`,
      () =>
        action.mutate(
          { fn: 'cover_contribution', args: { p_contribution: k.id, p_note: null } },
          {
            onSuccess: () => {
              haptic('success');
              close();
            },
            onError: (e) => notifyError(e),
          },
        ),
      { confirmText: 'Cover hulog' },
    );

  return (
    <Sheet open={!!k} onClose={close} title={unpaidK ? 'Unpaid hulog' : 'Proof of payment'} subtitle={member?.profiles?.full_name}>
      {k && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>
              {peso(k.amount)}
            </Text>
            {k.submitted_at && (
              <Text variant="small" tone="muted">
                {timeAgo(k.submitted_at)}
              </Text>
            )}
          </View>
          {k.note ? (
            <Text variant="small" tone="muted">
              Reference: {k.note}
            </Text>
          ) : null}
          {Number(k.late_fee) > 0 && (
            <Text variant="small" tone="warning">
              Paid late · {peso(k.late_fee)} late fee recorded
            </Text>
          )}
          {k.proof_path ? (
            <View style={styles.receipt}>
              {url.data ? <Image source={{ uri: url.data }} style={{ flex: 1 }} contentFit="contain" /> : <ActivityIndicator style={{ flex: 1 }} />}
            </View>
          ) : unpaidK ? (
            <Text tone="muted">No payment yet{k.status === 'rejected' && k.reject_reason ? ` (last receipt rejected: ${k.reject_reason})` : ''}.</Text>
          ) : null}
          {canCover && unpaidK && (
            <>
              <Button title="Cover this hulog" icon="shield" variant="secondary" onPress={cover} loading={action.isPending} />
              <Text variant="small" tone="faint" center>
                Use this when you paid for a member who can’t or won’t pay, so the recipient still gets the full sahod.
              </Text>
            </>
          )}
          {canReview && k.status === 'submitted' && (
            <>
              {rejecting ? (
                <>
                  <Input placeholder="Reason, e.g. amount is incomplete" value={reason} onChangeText={setReason} autoFocus />
                  <Button title="Reject receipt" variant="danger" onPress={() => review(false)} loading={action.isPending} />
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Reject" variant="secondary" onPress={() => setRejecting(true)} style={{ flex: 1 }} />
                  <Button title="Confirm received" variant="brand" icon="check" onPress={() => review(true)} loading={action.isPending} style={{ flex: 2 }} />
                </View>
              )}
              <Text variant="small" tone="faint" center>
                Only confirm once the funds appear in your GCash, Maya or bank account.
              </Text>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  receipt: { height: 360, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#8881' },
});

export default withAccount(RoundScreenScreen, 'Online paluwagan');
