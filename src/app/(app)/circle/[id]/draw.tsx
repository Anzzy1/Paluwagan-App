import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { DRAW_STYLES } from '@/components/draw/common';
import { DrawReplayList, DrawStage, DrawStylePicker } from '@/components/draw/DrawStage';
import { Confetti } from '@/components/ui/Confetti';
import { AvatarStack, IconButton } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCircle, useCircleAction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isRevealed } from '@/lib/derive';
import { verifyDraw, type VerifyResult } from '@/lib/draw';
import { dateTime, shortDate, slotName, slotsOf } from '@/lib/format';
import { useColors, useIsDesktop } from '@/lib/prefs';
import type { DrawStyle } from '@/lib/local';
import type { Member } from '@/lib/types';
import { radius } from '@/theme/tokens';
import { withAccount } from '@/components/AccountGate';

const sha256 = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
const people = (ms: Member[]) => ms.map((m) => ({ id: m.user_id, name: m.profiles?.full_name, uri: m.profiles?.avatar_url }));

function DrawScreenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const desktop = useIsDesktop();
  const c = useColors();
  const { userId } = useAuth();
  const q = useCircle(id);
  const action = useCircleAction(id);
  const [playing, setPlaying] = useState(false);
  /** A game picked on this screen (admin's pick, or a replay); otherwise the one saved on the paluwagan. */
  const [style, setStyle] = useState<DrawStyle | null>(null);
  const wasLocked = useRef<boolean | null>(null);

  const data = q.data;
  const status = data?.circle.status;

  // If the draw happens while a member is watching, play the reveal live.
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
  // Everyone watches the game the admin picked (saved with the draw), unless they chose a replay.
  const shownStyle: DrawStyle = style ?? circle.draw_style ?? 'wheel';
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === 'admin';
  const slots = slotsOf(members);
  const groupMembers = (g: string) => members.filter((m) => m.slot_group === g && m.status === 'approved');

  if (circle.status === 'locked' && circle.order_mode === 'manual') {
    return <ManualOrder circleId={id} slots={slots.map((s) => ({ group: s.group, members: s.members }))} isAdmin={!!isAdmin} />;
  }

  /** Admin picked a game and confirmed: run the draw and play it with that game. */
  const runDraw = (picked: DrawStyle) => {
    setStyle(picked);
    const done = {
      onSuccess: () => {
        wasLocked.current = false;
        setPlaying(true);
      },
    };
    // Save the game with the draw so members watch the same one (0015). Older databases
    // without that function fall back to the plain draw.
    action.mutate(
      { fn: 'run_draw_with_style', args: { p_circle: id, p_style: picked } },
      {
        ...done,
        onError: (e) => {
          if (/run_draw_with_style|PGRST202|could not find the function/i.test(String((e as Error)?.message ?? e))) {
            action.mutate({ fn: 'run_draw', args: { p_circle: id } }, { ...done, onError: (e2) => notifyError(e2) });
          } else notifyError(e);
        },
      },
    );
  };

  if (circle.status === 'locked') {
    return (
      <Screen back title="Verifiable draw" subtitle={`${circle.name} · ${slots.length} participants`}>
        <Columns
          main={
            <>
            {isAdmin && (
              <Card style={{ gap: 12 }}>
                <Text variant="h3">Pick a draw game</Text>
                <Text variant="small" tone="muted">
                  Tap a game to run the draw.
                </Text>
                <DrawStylePicker onStart={runDraw} disabled={action.isPending} />
              </Card>
            )}
            <Card padded={false}>
              <View style={styles.head}>
                <Text variant="h3">Participants</Text>
              </View>
              {slots.map((s) => (
                <View key={s.group} style={[styles.row, { borderTopColor: c.border }]}>
                  <AvatarStack people={people(s.members)} size={32} />
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {slotName(s.members)}
                  </Text>
                </View>
              ))}
            </Card>
            </>
          }
          side={
            <>
              <Card style={{ gap: 10 }}>
                <Text variant="h3">Commitment</Text>
                <Text variant="small" tone="muted">
                  Published when the paluwagan was locked. After the draw, the seed is revealed and anyone can confirm it produces this hash and the same payout order.
                </Text>
                <View style={[styles.mono, { backgroundColor: c.surfaceAlt }]}>
                  <Text variant="mono" selectable>
                    {circle.seed_hash}
                  </Text>
                </View>
              </Card>
              {isAdmin ? null : (
                <Card>
                  <Text variant="small" tone="muted" center>
                    Waiting for the admin to run the draw. Keep this page open to watch it live.
                  </Text>
                </Card>
              )}
            </>
          }
        />
      </Screen>
    );
  }

  const order = circle.draw_order ?? [];
  const goButton = <Button title="Go to paluwagan" icon="arrow-right" variant="brand" full={!desktop} onPress={() => router.replace(`/circle/${id}`)} />;
  // The order is fixed, but it only counts as declared once the admin finishes the draw.
  const revealed = isRevealed(circle);
  const reveal = () => action.mutate({ fn: 'reveal_draw', args: { p_circle: id } }, { onError: (e) => notifyError(e, 'Couldn’t show the results') });

  // Draw stopped before the end: the admin can play it again or show the results; members wait.
  if (!revealed && !playing) {
    return (
      <Screen back title="Draw not finished" subtitle={circle.name}>
        <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
          <Feather name={isAdmin ? 'play-circle' : 'clock'} size={36} color={c.brand} />
          <Text variant="h2" center>
            {isAdmin ? 'Finish the draw' : 'Waiting for the draw'}
          </Text>
          <Text tone="muted" center style={{ maxWidth: 420 }}>
            {isAdmin
              ? 'The payout order is already locked in and can’t change. Play the draw for everyone, or show the results now. Payments open after that.'
              : 'The admin hasn’t finished the draw yet. Keep this page open to watch it. Payments open once the payout order is shown.'}
          </Text>
          {isAdmin && (
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 4 }}>
              <Button title={`Play the draw · ${DRAW_STYLES.find((d) => d.id === shownStyle)?.title ?? ''}`} icon="play" variant="brand" onPress={() => setPlaying(true)} />
              <Button title="Show results now" icon="eye" variant="secondary" loading={action.isPending} onPress={reveal} />
            </View>
          )}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title={playing ? DRAW_STYLES.find((d) => d.id === shownStyle)?.title ?? 'Drawing…' : 'Draw results'}
      subtitle={circle.drawn_at ? `${circle.name} · ${dateTime(circle.drawn_at)}` : circle.name}
      // Always-visible next step once the results are showing.
      footer={!playing && !desktop && goButton}
      right={!playing && desktop ? goButton : undefined}>
      <Columns
        main={
          playing ? (
            <Card style={{ paddingVertical: 24 }}>
              <DrawStage
                style={shownStyle}
                participants={slots.map((s) => ({ id: s.group, name: slotName(s.members) }))}
                order={order}
                onDone={() => {
                  // The admin watched it to the end: declare the order so payments open.
                  if (isAdmin && !revealed) reveal();
                  setTimeout(() => setPlaying(false), 2500);
                }}
              />
            </Card>
          ) : (
            <Reveal
              order={order}
              nameOf={(g) => slotName(groupMembers(g))}
              membersOf={groupMembers}
              dueOf={(i) => rounds.find((r) => r.round_no === i + 1)?.due_date}
              myGroup={me?.slot_group}
              playing={false}
              onDone={() => setPlaying(false)}
            />
          )
        }
        side={
          !playing && (
            <>
              {order.length > 0 && (
                <Card style={{ gap: 8 }}>
                  <Text variant="h3">Replay the draw</Text>
                  <Text variant="small" tone="muted">
                    Watch the same fair result again with any game.
                  </Text>
                  <DrawReplayList
                    onPick={(id) => {
                      setStyle(id);
                      setPlaying(true);
                    }}
                  />
                </Card>
              )}
              {circle.order_mode === 'draw' && circle.seed && circle.seed_hash ? (
                <VerifyCard seed={circle.seed} seedHash={circle.seed_hash} groups={slots.map((s) => s.group)} order={order} />
              ) : (
                <Card>
                  <Text variant="small" tone="muted">
                    The payout order was set manually by the admin.
                  </Text>
                </Card>
              )}
            </>
          )
        }
      />
    </Screen>
  );
}

// ---------------------------------------------------------------- Reveal
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
    const tick = setInterval(() => {
      k++;
      haptic('medium');
      setStep(k);
      if (k >= order.length) {
        clearInterval(tick);
        clearInterval(spin);
        haptic('success');
        setConfetti(Date.now());
        setTimeout(() => doneRef.current(), 400);
      }
    }, order.length > 12 ? 500 : 850);
    return () => {
      clearInterval(spin);
      clearInterval(tick);
    };
  }, [playing, order.length]);

  return (
    <>
      <Card padded={false}>
        <View style={styles.head}>
          <Text variant="h3">Payout order</Text>
          <Text variant="small" tone="muted">
            {Math.min(revealed, order.length)}/{order.length} revealed
          </Text>
        </View>
        {order.map((g, i) => {
          const shown = i < revealed;
          const spinning = playing && i === revealed;
          const mine = g === myGroup;
          return (
            <View
              key={g}
              style={[
                styles.reelRow,
                { borderTopColor: c.border },
                spinning && { backgroundColor: c.surfaceAlt },
                mine && shown && { backgroundColor: c.brandSoft },
              ]}>
              <View style={[styles.reelNum, { backgroundColor: shown ? c.ink : c.surfaceAlt }]}>
                <Text variant="smallBold" color={shown ? c.onInk : c.textFaint}>
                  {i + 1}
                </Text>
              </View>
              {shown ? (
                <Animated.View entering={FadeInDown.duration(260)} style={styles.reelBody}>
                  <AvatarStack people={people(membersOf(g))} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold" numberOfLines={1}>
                      {names[i]}
                      {mine ? ' (you)' : ''}
                    </Text>
                    {dueOf(i) && (
                      <Text variant="small" tone="muted">
                        Payout {shortDate(dueOf(i)!)}
                      </Text>
                    )}
                  </View>
                </Animated.View>
              ) : spinning ? (
                <Animated.View entering={FadeIn} style={styles.reelBody}>
                  <Text variant="bodyBold" tone="muted" numberOfLines={1}>
                    {spinName}
                  </Text>
                </Animated.View>
              ) : (
                <View style={styles.reelBody}>
                  <View style={[styles.placeholder, { backgroundColor: c.surfaceAlt }]} />
                </View>
              )}
            </View>
          );
        })}
      </Card>
      <Confetti run={confetti} count={70} />
    </>
  );
}

// ---------------------------------------------------------------- Verify
function Check({ ok, label }: { ok: boolean; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Feather name={ok ? 'check-circle' : 'x-circle'} size={16} color={ok ? c.success : c.danger} />
      <Text variant="smallBold" tone={ok ? 'success' : 'danger'} style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

function VerifyCard({ seed, seedHash, groups, order }: { seed: string; seedHash: string; groups: string[]; order: string[] }) {
  const c = useColors();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await verifyDraw({ seed, seedHash, slotGroups: groups, publishedOrder: order }, sha256));
      haptic('success');
    } catch (e) {
      notifyError(e, 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text variant="h3">Verify this draw</Text>
      <Text variant="small" tone="muted">
        Your device recomputes the result from the revealed seed. If both checks pass, the order could not have been altered.
      </Text>
      <View style={[styles.mono, { backgroundColor: c.surfaceAlt, gap: 4 }]}>
        <Text variant="caption" tone="faint">
          Revealed seed
        </Text>
        <Text variant="mono" selectable>
          {seed}
        </Text>
        <Text variant="caption" tone="faint" style={{ marginTop: 6 }}>
          Commitment (SHA-256)
        </Text>
        <Text variant="mono" selectable>
          {seedHash}
        </Text>
      </View>
      {result ? (
        <View style={{ gap: 8 }}>
          <Check ok={result.hashMatches} label={result.hashMatches ? 'Seed matches the published commitment' : 'Seed does NOT match the commitment'} />
          <Check ok={result.orderMatches} label={result.orderMatches ? 'Payout order matches the recomputed result' : 'Payout order does NOT match'} />
        </View>
      ) : (
        <Button title="Verify now" icon="shield" variant="secondary" onPress={run} loading={busy} />
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
  };

  return (
    <Screen
      back
      narrow
      title="Set payout order"
      subtitle={isAdmin ? 'Position 1 receives the first payout.' : 'Waiting for the admin to set the payout order.'}
      footer={
        isAdmin ? (
          <Button
            title="Save order and start paluwagan"
            loading={action.isPending}
            onPress={() => action.mutate({ fn: 'set_manual_order', args: { p_circle: circleId, p_order: order.map((s) => s.group) } }, { onError: (e) => notifyError(e) })}
          />
        ) : undefined
      }>
      <Card padded={false}>
        {order.map((s, i) => (
          <View key={s.group} style={[styles.reelRow, i === 0 && { borderTopWidth: 0 }, { borderTopColor: c.border }]}>
            <View style={[styles.reelNum, { backgroundColor: c.ink }]}>
              <Text variant="smallBold" tone="onInk">
                {i + 1}
              </Text>
            </View>
            <AvatarStack people={people(s.members)} size={30} />
            <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
              {slotName(s.members)}
            </Text>
            {isAdmin && (
              <>
                <IconButton icon="arrow-up" size={32} onPress={() => move(i, -1)} label="Move up" />
                <IconButton icon="arrow-down" size={32} onPress={() => move(i, 1)} label="Move down" />
              </>
            )}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  mono: { padding: 12, borderRadius: radius.sm },
  reelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 60, borderTopWidth: 1 },
  reelNum: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  reelBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeholder: { height: 10, width: '40%', borderRadius: 5 },
});

export default withAccount(DrawScreenScreen, 'Online paluwagan');
