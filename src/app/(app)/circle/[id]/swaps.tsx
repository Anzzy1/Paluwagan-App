import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Avatar, Chip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useCircle, useCircleAction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate, slotName } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import type { Swap } from '@/lib/types';
import { radius } from '@/theme/tokens';

const STATUS_LABEL: Record<Swap['status'], { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Hinihintay ang sagot', tone: 'neutral' },
  accepted: { label: 'Hinihintay ang admin', tone: 'info' },
  declined: { label: 'Tinanggihan', tone: 'danger' },
  approved: { label: 'Napalitan na ✓', tone: 'success' },
  rejected: { label: 'Ni-reject ng admin', tone: 'danger' },
  cancelled: { label: 'Kinansela', tone: 'neutral' },
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
  const hasOpen = swaps.some((s) => (s.status === 'pending' || s.status === 'accepted') && [s.from_member, s.to_member].some((x) => memberById.get(x)?.slot_group === me.slot_group));

  // One representative member per other upcoming slot
  const candidates = rounds
    .filter((r) => r.status === 'upcoming' && r.slot_group !== me.slot_group)
    .map((r) => ({ round: r, member: members.find((m) => m.slot_group === r.slot_group && m.status === 'approved')! }))
    .filter((x) => x.member);

  const act = (fn: string, args: Record<string, unknown>, after?: () => void) =>
    action.mutate({ fn, args }, { onSuccess: after, onError: (e) => Alert.alert('May mali', errMsg(e)) });

  return (
    <Screen
      back
      title="Palit-Slot 🔁"
      subtitle="Kailangan ng sahod nang mas maaga? Makipagpalit ng turn sa ka-circle — kailangang pumayag siya at ang admin."
      refreshing={q.isRefetching}
      onRefresh={q.refetch}>
      <Card tint="mango" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.num, { backgroundColor: c.ink }]}>
          <Text variant="h2" tone="onInk">
            {myRound?.round_no ?? '–'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            Slot mo ngayon
          </Text>
          <Text variant="h3">{myRound ? `Sahod sa ${shortDate(myRound.due_date)}` : '—'}</Text>
        </View>
      </Card>

      {swaps.length > 0 && (
        <>
          <Text variant="h3">Mga request</Text>
          {swaps.map((s) => {
            const from = memberById.get(s.from_member);
            const to = memberById.get(s.to_member);
            if (!from || !to) return null;
            const iAmTo = to.slot_group === me.slot_group && to.user_id === userId;
            const iAmFrom = from.user_id === userId;
            const st = STATUS_LABEL[s.status];
            return (
              <Card key={s.id} style={{ gap: 12 }}>
                <View style={styles.swapRow}>
                  <View style={styles.swapSide}>
                    <Avatar emoji={from.profiles?.avatar_emoji} />
                    <Text variant="smallBold" numberOfLines={1}>
                      {groupName(from.slot_group)}
                    </Text>
                    <Text variant="small" tone="muted">
                      #{roundOf(from.slot_group)?.round_no}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 22 }}>⇄</Text>
                  <View style={styles.swapSide}>
                    <Avatar emoji={to.profiles?.avatar_emoji} />
                    <Text variant="smallBold" numberOfLines={1}>
                      {groupName(to.slot_group)}
                    </Text>
                    <Text variant="small" tone="muted">
                      #{roundOf(to.slot_group)?.round_no}
                    </Text>
                  </View>
                </View>
                <Chip label={st.label} tone={st.tone} />
                {s.status === 'pending' && iAmTo && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button title="Ayoko" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'decline' })} />
                    <Button title="Payag ako" size="md" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'accept' })} />
                  </View>
                )}
                {s.status === 'accepted' && isAdmin && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button title="I-reject" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'reject' })} />
                    <Button title="I-approve" variant="accent" size="md" style={{ flex: 1 }} onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'approve' })} />
                  </View>
                )}
                {(s.status === 'pending' || s.status === 'accepted') && iAmFrom && (
                  <Button title="Kanselahin" variant="ghost" size="sm" onPress={() => act('respond_swap', { p_swap: s.id, p_action: 'cancel' })} />
                )}
              </Card>
            );
          })}
        </>
      )}

      <Text variant="h3">Makipagpalit kay…</Text>
      {!canSwapMine ? (
        <Card>
          <Text tone="muted" center>
            Nagsimula na o tapos na ang slot mo, kaya hindi na ito mapapalitan.
          </Text>
        </Card>
      ) : hasOpen ? (
        <Card>
          <Text tone="muted" center>
            May bukas ka pang request. Hintayin muna itong matapos.
          </Text>
        </Card>
      ) : candidates.length === 0 ? (
        <Card>
          <Text tone="muted" center>
            Walang ibang slot na puwedeng palitan.
          </Text>
        </Card>
      ) : (
        <>
          {candidates.map(({ round, member }) => (
            <PressableScale
              key={round.id}
              onPress={() => setTarget(member.id)}
              style={[styles.cand, { backgroundColor: c.surface, borderColor: target === member.id ? c.ink : c.border, borderWidth: target === member.id ? 2 : 1 }]}>
              <View style={[styles.num, { backgroundColor: c.surfaceAlt }]}>
                <Text variant="h3">{round.round_no}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{groupName(round.slot_group)}</Text>
                <Text variant="small" tone="muted">
                  Sahod sa {shortDate(round.due_date)} · Tiwala {member.profiles?.tiwala_score}
                </Text>
              </View>
            </PressableScale>
          ))}
          <Button
            title="Ipadala ang request"
            icon="repeat"
            disabled={!target}
            loading={action.isPending}
            onPress={() => act('request_swap', { p_circle: id, p_to_member: target }, () => setTarget(null))}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  num: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  swapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  swapSide: { alignItems: 'center', gap: 4, flex: 1 },
  cand: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg },
});
