import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Confetti } from '@/components/ui/Confetti';
import { Avatar, IconButton } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useCircle, useCircleAction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { verifyDraw, type VerifyResult } from '@/lib/draw';
import { slotName, slotsOf, shortDate } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import type { Member } from '@/lib/types';
import { radius } from '@/theme/tokens';

const sha256 = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

export default function DrawScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const q = useCircle(id);
  const action = useCircleAction(id);
  const [playing, setPlaying] = useState(false);
  const wasLocked = useRef<boolean | null>(null);

  const data = q.data;
  const status = data?.circle.status;

  // If the draw happens while we're watching (e.g. a member waiting), play the reveal.
  useEffect(() => {
    if (!status) return;
    if (wasLocked.current === true && status === 'active' && data?.circle.order_mode === 'draw') setPlaying(true);
    wasLocked.current = status === 'locked';
  }, [status, data?.circle.order_mode]);

  if (!data) {
    return (
      <Screen back>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </Screen>
    );
  }

  const { circle, members, rounds } = data;
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === 'admin';
  const slots = slotsOf(members);
  const groupMembers = (g: string) => members.filter((m) => m.slot_group === g && m.status === 'approved');

  if (circle.status === 'locked' && circle.order_mode === 'manual') {
    return <ManualOrder circleId={id} slots={slots.map((s) => ({ group: s.group, members: s.members }))} isAdmin={!!isAdmin} />;
  }

  if (circle.status === 'locked') {
    return (
      <Screen back title="Digital Bunot 🎲" subtitle="Random, patas, at kayang i-verify ng lahat.">
        <Card style={{ gap: 8 }}>
          <Text variant="h3">🔐 Commitment hash</Text>
          <Text variant="small" tone="muted">
            Ginawa ito noong ni-lock ang circle. Kapag lumabas na ang seed pagkatapos ng bunot, puwedeng i-check ng kahit sino na
            tugma ito — patunay na hindi binago ang resulta.
          </Text>
          <View style={styles.mono}>
            <Text variant="small" style={{ fontFamily: 'monospace' }} selectable>
              {circle.seed_hash}
            </Text>
          </View>
        </Card>
        <Text variant="h3">Kasali sa bunot ({slots.length})</Text>
        <View style={styles.wrap}>
          {slots.map((s) => (
            <View key={s.group} style={styles.ticket}>
              <SlotTicket members={s.members} />
            </View>
          ))}
        </View>
        {isAdmin ? (
          <Button
            title="Bunot na! 🎲"
            variant="accent"
            loading={action.isPending}
            onPress={() =>
              action.mutate(
                { fn: 'run_draw', args: { p_circle: id } },
                {
                  onSuccess: () => {
                    wasLocked.current = false;
                    setPlaying(true);
                  },
                  onError: (e) => Alert.alert('May mali', errMsg(e)),
                },
              )
            }
          />
        ) : (
          <Card>
            <Text tone="muted" center>
              Hinihintay ang admin na simulan ang bunot… Manatili dito para mapanood nang live! 👀
            </Text>
          </Card>
        )}
      </Screen>
    );
  }

  const order = circle.draw_order ?? [];
  return (
    <Screen back title={playing ? 'Bumubunot… 🎲' : 'Resulta ng Bunot'} subtitle={circle.drawn_at ? `Ginawa noong ${new Date(circle.drawn_at).toLocaleString()}` : undefined}>
      <Reveal
        order={order}
        nameOf={(g) => slotName(groupMembers(g))}
        membersOf={groupMembers}
        dueOf={(i) => rounds.find((r) => r.round_no === i + 1)?.due_date}
        myGroup={me?.slot_group}
        playing={playing}
        onDone={() => setPlaying(false)}
      />
      {!playing && circle.order_mode === 'draw' && circle.seed && circle.seed_hash && (
        <VerifyCard seed={circle.seed} seedHash={circle.seed_hash} groups={slots.map((s) => s.group)} order={order} />
      )}
      {!playing && circle.order_mode === 'manual' && (
        <Card>
          <Text tone="muted" center>
            Inayos ng admin ang pagkakasunod (manual mode).
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function SlotTicket({ members }: { members: Member[] }) {
  return (
    <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row' }}>
        {members.map((m, i) => (
          <View key={m.id} style={{ marginLeft: i ? -10 : 0 }}>
            <Avatar emoji={m.profiles?.avatar_emoji} size={40} />
          </View>
        ))}
      </View>
      <Text variant="smallBold" numberOfLines={1} center>
        {slotName(members)}
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------- Reveal animation
function Reveal({
  order,
  nameOf,
  membersOf,
  dueOf,
  myGroup,
  playing,
  onDone,
}: {
  order: string[];
  nameOf: (g: string) => string;
  membersOf: (g: string) => Member[];
  dueOf: (i: number) => string | undefined;
  myGroup?: string;
  playing: boolean;
  onDone: () => void;
}) {
  const c = useColors();
  const [step, setStep] = useState(0);
  const [spinName, setSpinName] = useState('');
  const [confetti, setConfetti] = useState(0);
  const names = order.map(nameOf);
  const namesRef = useRef(names);
  const doneRef = useRef(onDone);
  useEffect(() => {
    namesRef.current = names;
    doneRef.current = onDone;
  });

  // Restart from 0 whenever a new playback begins (state adjustment during render).
  const [wasPlaying, setWasPlaying] = useState(playing);
  if (playing !== wasPlaying) {
    setWasPlaying(playing);
    if (playing) setStep(0);
  }
  const revealed = playing ? step : order.length;

  useEffect(() => {
    if (!playing) return;
    let k = 0;
    const spin = setInterval(() => {
      const ns = namesRef.current;
      setSpinName(ns[Math.floor(Math.random() * ns.length)]);
    }, 70);
    const step = setInterval(() => {
      k++;
      haptic('medium');
      setStep(k);
      if (k >= order.length) {
        clearInterval(step);
        clearInterval(spin);
        haptic('success');
        setConfetti(Date.now());
        setTimeout(() => doneRef.current(), 400);
      }
    }, order.length > 12 ? 600 : 1000);
    return () => {
      clearInterval(spin);
      clearInterval(step);
    };
  }, [playing, order.length]);

  return (
    <>
      <View style={{ gap: 10 }}>
        {order.map((g, i) => {
          const shown = i < revealed;
          const spinning = playing && i === revealed;
          const mine = g === myGroup;
          if (!shown && !spinning) {
            return (
              <View key={g} style={[styles.reelRow, { backgroundColor: c.surface, borderColor: c.border, opacity: 0.5 }]}>
                <View style={[styles.reelNum, { backgroundColor: c.surfaceAlt }]}>
                  <Text variant="h3" tone="faint">
                    {i + 1}
                  </Text>
                </View>
                <Text variant="bodyBold" tone="faint">
                  ? ? ?
                </Text>
              </View>
            );
          }
          return (
            <Animated.View
              key={g}
              entering={shown ? ZoomIn.springify().damping(12) : FadeIn}
              style={[
                styles.reelRow,
                {
                  backgroundColor: mine && shown ? c.accent : c.surface,
                  borderColor: spinning ? c.ink : c.border,
                  borderWidth: spinning ? 2 : 1,
                },
              ]}>
              <View style={[styles.reelNum, { backgroundColor: mine && shown ? c.accentInk : c.ink }]}>
                <Text variant="h3" color={mine && shown ? c.accent : c.onInk}>
                  {i + 1}
                </Text>
              </View>
              {shown ? (
                <>
                  <View style={{ flexDirection: 'row' }}>
                    {membersOf(g).map((m, j) => (
                      <View key={m.id} style={{ marginLeft: j ? -10 : 0 }}>
                        <Avatar emoji={m.profiles?.avatar_emoji} size={34} bg={c.surfaceAlt} />
                      </View>
                    ))}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold" color={mine ? c.accentInk : c.text} numberOfLines={1}>
                      {names[i]} {mine ? '(Ikaw!)' : ''}
                    </Text>
                    {dueOf(i) && (
                      <Text variant="small" color={mine ? c.accentInk : c.textMuted}>
                        Sahod sa {shortDate(dueOf(i)!)}
                      </Text>
                    )}
                  </View>
                </>
              ) : (
                <Text variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                  {spinName}
                </Text>
              )}
            </Animated.View>
          );
        })}
      </View>
      <Confetti run={confetti} count={80} />
    </>
  );
}

// ---------------------------------------------------------------- Verify
function Check({ ok, label }: { ok: boolean; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Feather name={ok ? 'check-circle' : 'x-circle'} size={18} color={ok ? c.success : c.danger} />
      <Text variant="bodyBold" tone={ok ? 'success' : 'danger'}>
        {label}
      </Text>
    </View>
  );
}

function VerifyCard({ seed, seedHash, groups, order }: { seed: string; seedHash: string; groups: string[]; order: string[] }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await verifyDraw({ seed, seedHash, slotGroups: groups, publishedOrder: order }, sha256));
      haptic('success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text variant="h3">🛡️ I-verify ang bunot</Text>
      <Text variant="small" tone="muted">
        Kinukuwenta ulit ng phone mo ang resulta gamit ang inilabas na seed. Kapag tugma ang lahat, siguradong walang nandaya.
      </Text>
      <View style={[styles.mono]}>
        <Text variant="caption" tone="faint">
          Seed
        </Text>
        <Text variant="small" style={{ fontFamily: 'monospace' }} selectable>
          {seed}
        </Text>
        <Text variant="caption" tone="faint" style={{ marginTop: 8 }}>
          SHA-256 hash (na-publish bago ang bunot)
        </Text>
        <Text variant="small" style={{ fontFamily: 'monospace' }} selectable>
          {seedHash}
        </Text>
      </View>
      {result ? (
        <View style={{ gap: 6 }}>
          <Check ok={result.hashMatches} label={result.hashMatches ? 'Tugma ang seed sa naunang hash' : 'HINDI tugma ang hash!'} />
          <Check ok={result.orderMatches} label={result.orderMatches ? 'Pareho ang resulta sa kinuwenta ng phone mo' : 'HINDI tugma ang order!'} />
        </View>
      ) : (
        <Button title="I-verify ngayon" icon="shield" variant="secondary" onPress={run} loading={busy} />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Manual order
function ManualOrder({ circleId, slots, isAdmin }: { circleId: string; slots: { group: string; members: Member[] }[]; isAdmin: boolean }) {
  const c = useColors();
  const action = useCircleAction(circleId);
  const [order, setOrder] = useState(slots);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    haptic('light');
  };

  return (
    <Screen
      back
      title="Ayusin ang pagkakasunod"
      subtitle={isAdmin ? 'Gamitin ang arrows. Ang nasa #1 ang unang makakatanggap.' : 'Hinihintay ang admin na ayusin ang pagkakasunod.'}
      footer={
        isAdmin ? (
          <Button
            title="I-save at simulan ang circle"
            loading={action.isPending}
            onPress={() =>
              action.mutate(
                { fn: 'set_manual_order', args: { p_circle: circleId, p_order: order.map((s) => s.group) } },
                { onError: (e) => Alert.alert('May mali', errMsg(e)) },
              )
            }
          />
        ) : undefined
      }>
      {order.map((s, i) => (
        <View key={s.group} style={[styles.reelRow, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.reelNum, { backgroundColor: c.ink }]}>
            <Text variant="h3" tone="onInk">
              {i + 1}
            </Text>
          </View>
          <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
            {slotName(s.members)}
          </Text>
          {isAdmin && (
            <>
              <IconButton icon="arrow-up" size={36} onPress={() => move(i, -1)} />
              <IconButton icon="arrow-down" size={36} onPress={() => move(i, 1)} />
            </>
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mono: { padding: 12, borderRadius: radius.sm, backgroundColor: '#8881' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ticket: { width: '31%', flexGrow: 1 },
  reelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, minHeight: 64 },
  reelNum: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
