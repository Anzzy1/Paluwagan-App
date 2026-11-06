import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { PaySheet } from '@/components/circle/PaySheet';
import { Confetti } from '@/components/ui/Confetti';
import { Avatar, Input, ProgressRing, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useCircle, useCircleAction, useReceiptUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { recipientsOf } from '@/lib/derive';
import { displayStatus, longDate, peso, potOf, slotName, timeAgo } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import type { Contribution, Member } from '@/lib/types';
import { radius } from '@/theme/tokens';

export default function RoundScreen() {
  const { id, roundId } = useLocalSearchParams<{ id: string; roundId: string }>();
  const c = useColors();
  const { userId } = useAuth();
  const q = useCircle(id);
  const [review, setReview] = useState<Contribution | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [confetti, setConfetti] = useState(0);

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
      <Screen back title="Walang round">
        <View />
      </Screen>
    );
  }
  const me = members.find((m) => m.user_id === userId);
  const recipients = recipientsOf(round, members);
  const canReview = me?.role === 'admin' || me?.slot_group === round.slot_group;
  const ks = contributions
    .filter((k) => k.round_id === round.id)
    .sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const paid = ks.filter((k) => k.status === 'confirmed');
  const collected = paid.reduce((s, k) => s + Number(k.amount), 0);
  const myK = ks.find((k) => k.member_id === me?.id);

  return (
    <View style={{ flex: 1 }}>
      <Screen back title={`Round ${round.round_no}`} subtitle={`Due ${longDate(round.due_date)}`} refreshing={q.isRefetching} onRefresh={q.refetch}>
        <Card tint={circle.color} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <ProgressRing size={92} stroke={10} progress={collected / potOf(circle)} color={c.ink} track="rgba(0,0,0,0.08)">
            <Text variant="h3">{Math.round((collected / potOf(circle)) * 100)}%</Text>
          </ProgressRing>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" tone="muted">
              Nakolekta
            </Text>
            <Text variant="h1">{peso(collected)}</Text>
            <Text variant="small" tone="muted">
              ng {peso(potOf(circle))} para kay {slotName(recipients)}
            </Text>
          </View>
        </Card>

        {recipients.map((m) => (
          <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar emoji={m.profiles?.avatar_emoji} size={48} bg={c.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="muted">
                May sahod
              </Text>
              <Text variant="h3">{m.profiles?.full_name}</Text>
              <Text variant="small" tone="muted">
                {m.profiles?.gcash_number ? `GCash/Maya ${m.profiles.gcash_number}` : 'Walang GCash na naka-set'}
              </Text>
            </View>
          </Card>
        ))}

        {myK && !myK.auto && (myK.status === 'pending' || myK.status === 'rejected') && round.status !== 'completed' && (
          <Button title={`Magbayad ${peso(myK.amount)}`} icon="send" onPress={() => setPayOpen(true)} />
        )}

        <Text variant="h3">Mga hulog ({paid.length}/{ks.length})</Text>
        <Card padded={false}>
          {ks.map((k, i) => {
            const m = memberById.get(k.member_id);
            const clickable = canReview && k.status === 'submitted';
            return (
              <PressableScale
                key={k.id}
                disabled={!clickable && !k.proof_path}
                onPress={() => setReview(k)}
                scaleTo={0.99}
                style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: i < ks.length - 1 ? 1 : 0 }, clickable && { backgroundColor: c.infoBg }]}>
                <Avatar emoji={m?.profiles?.avatar_emoji} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold" numberOfLines={1}>
                    {m?.profiles?.full_name ?? 'Member'} {m?.user_id === userId ? '(Ikaw)' : ''}
                  </Text>
                  <Text variant="small" tone="muted">
                    {k.auto
                      ? 'Sariling share ng may sahod'
                      : k.submitted_at
                        ? `${peso(k.amount)} · ${timeAgo(k.submitted_at)}${k.on_time === false ? ' · late' : ''}`
                        : peso(k.amount)}
                  </Text>
                </View>
                {k.auto ? <Feather name="star" size={18} color={c.warning} /> : <StatusChip status={displayStatus(k, round, circle)} />}
              </PressableScale>
            );
          })}
        </Card>
        {canReview && ks.some((k) => k.status === 'submitted') && (
          <Text variant="small" tone="faint" center>
            I-tap ang mga naka-highlight para tingnan ang resibo at i-confirm.
          </Text>
        )}
      </Screen>

      <ReviewSheet
        k={review}
        member={review ? memberById.get(review.member_id) : undefined}
        canReview={!!canReview}
        circleId={id}
        onClose={() => setReview(null)}
        onConfirmed={(roundDone) => {
          if (roundDone) setConfetti(Date.now());
        }}
        remainingAfter={ks.filter((x) => x.status !== 'confirmed').length - 1}
      />
      {myK && (
        <PaySheet open={payOpen} onClose={() => setPayOpen(false)} circle={circle} round={round} contribution={myK} recipients={recipients} />
      )}
      <Confetti run={confetti} />
    </View>
  );
}

function ReviewSheet({
  k,
  member,
  canReview,
  circleId,
  onClose,
  onConfirmed,
  remainingAfter,
}: {
  k: Contribution | null;
  member?: Member;
  canReview: boolean;
  circleId: string;
  onClose: () => void;
  onConfirmed: (roundDone: boolean) => void;
  remainingAfter: number;
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
          if (approve) onConfirmed(remainingAfter <= 0);
          close();
        },
        onError: (e) => Alert.alert('May mali', errMsg(e)),
      },
    );

  return (
    <Sheet open={!!k} onClose={close} title={member?.profiles?.full_name ?? 'Resibo'}>
      {k && (
        <>
          <Text variant="display">{peso(k.amount)}</Text>
          {k.note ? <Text tone="muted">“{k.note}”</Text> : null}
          <View style={styles.receipt}>
            {url.data ? <Image source={{ uri: url.data }} style={{ flex: 1 }} contentFit="contain" /> : <ActivityIndicator style={{ flex: 1 }} />}
          </View>
          {canReview && k.status === 'submitted' && (
            <>
              {rejecting ? (
                <>
                  <Input placeholder="Bakit? hal. Kulang ang halaga" value={reason} onChangeText={setReason} autoFocus />
                  <Button title="I-reject ang resibo" variant="danger" onPress={() => review(false)} loading={action.isPending} />
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="May mali" variant="secondary" onPress={() => setRejecting(true)} style={{ flex: 1 }} />
                  <Button title="Natanggap ko ✓" variant="accent" onPress={() => review(true)} loading={action.isPending} style={{ flex: 2 }} />
                </View>
              )}
              <Text variant="small" tone="faint" center>
                I-confirm lang kapag nakita mo na talaga ang pera sa GCash/bank mo.
              </Text>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  receipt: { height: 380, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#00000010' },
});
