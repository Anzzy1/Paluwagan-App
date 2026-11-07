import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colorAt, type DrawGameProps, type Participant } from '@/components/draw/common';
import { Button } from '@/components/ui/Button';
import { Confetti } from '@/components/ui/Confetti';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { duckMusic, loop, sfx } from '@/lib/sfx';
import { font, radius } from '@/theme/tokens';

export const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/**
 * Round-by-round draw state shared by the games: who's been drawn, the current winner (shown in
 * the popup until closed), and the auto-assigned last person. Games only decide how to animate
 * picking `next`, then call `announce(next)`.
 */
export function useRounds({ participants, order, onDone }: DrawGameProps) {
  const [revealed, setRevealed] = useState<string[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [party, setParty] = useState(0);

  const done = revealed.length >= order.length;
  const next = order[revealed.length] as string | undefined;
  /** Still in play, plus the winner until the popup closes. */
  const inPlay = participants.filter((p) => !revealed.includes(p.id) || p.id === winner);
  const colorOf = (id: string) => colorAt(participants.findIndex((p) => p.id === id));
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? '';

  const announce = (w: string) => {
    loop('drumroll', false);
    duckMusic(false);
    sfx('win');
    haptic('success');
    setWinner(w);
    setParty((x) => x + 1);
    const nextRevealed = [...revealed, w];
    // When one person is left, they take the last slot automatically.
    const left = participants.filter((p) => !nextRevealed.includes(p.id));
    if (left.length === 1) nextRevealed.push(left[0].id);
    setRevealed(nextRevealed);
  };

  /** Close the popup. Returns who's still in play so a game can start the next pick right away. */
  const close = (): Participant[] | null => {
    setWinner(null);
    if (revealed.length >= order.length) {
      onDone();
      return null;
    }
    return participants.filter((p) => !revealed.includes(p.id));
  };

  /** Start the suspense: drumroll on, music down. */
  const suspense = (on: boolean) => {
    loop('drumroll', on, 0.6);
    duckMusic(on);
  };

  return { revealed, winner, party, done, next, inPlay, colorOf, nameOf, announce, close, suspense };
}

export type Rounds = ReturnType<typeof useRounds>;

/** Payout order, first to last; fills in as people are drawn. */
export function PayoutOrderList({ rounds, order, pending = 'Waiting to be drawn' }: { rounds: Rounds; order: string[]; pending?: string }) {
  const c = useColors();
  const { revealed, winner, colorOf, nameOf } = rounds;
  const last = order.length;
  return (
    <View style={[styles.order, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.orderHead}>
        <Text variant="h3">Payout order</Text>
        <Text variant="small" tone="muted">
          {Math.min(revealed.length, last)} of {last} drawn
        </Text>
      </View>
      {order.map((_, i) => {
        const id = revealed[i];
        const isNew = id && id === winner;
        const label = i === 0 ? 'First payout' : i === last - 1 ? 'Last payout' : null;
        return (
          <Animated.View
            key={i}
            entering={id ? FadeInDown.duration(250) : undefined}
            style={[styles.row, { borderTopColor: c.border }, i === 0 && { borderTopWidth: 0 }, isNew && { backgroundColor: c.brandSoft }]}>
            <View style={[styles.num, { backgroundColor: id ? colorOf(id) : c.surfaceAlt }]}>
              <Text variant="smallBold" color={id ? '#fff' : c.textFaint}>
                {i + 1}
              </Text>
            </View>
            <Text variant="bodyBold" numberOfLines={1} style={{ flex: 1 }} color={id ? c.text : c.textFaint}>
              {id ? nameOf(id) : pending}
            </Text>
            {label && (
              <View style={[styles.tag, { backgroundColor: i === 0 ? c.brandSoft : c.surfaceAlt }]}>
                {i === 0 && <Feather name="award" size={12} color={c.brandText} />}
                <Text variant="caption" color={i === 0 ? c.brandText : c.textMuted}>
                  {label}
                </Text>
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The winner popup for the current round, wired to the shared state. */
export function RoundWinner({ rounds, order, action, onNext }: { rounds: Rounds; order: string[]; action: string; onNext: () => void }) {
  const { winner, revealed, party, nameOf, colorOf } = rounds;
  if (!winner) return null;
  const autoLast = revealed.length === order.length && revealed[revealed.length - 1] !== winner ? nameOf(revealed[revealed.length - 1]) : null;
  return (
    <WinnerPopup
      party={party}
      slot={revealed.indexOf(winner) + 1}
      total={order.length}
      name={nameOf(winner)}
      color={colorOf(winner)}
      autoLast={autoLast}
      action={action}
      onNext={onNext}
      onClose={() => rounds.close()}
    />
  );
}

const RAY = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(100 + 100 * Math.sin(a)).toFixed(1)} ${(100 - 100 * Math.cos(a)).toFixed(1)}`;
};

/** "We have a winner" popup, like the classic name wheels, with a turning sunburst and confetti. */
export function WinnerPopup({
  party,
  slot,
  total,
  name,
  color,
  autoLast,
  action = 'Spin',
  onNext,
  onClose,
}: {
  party: number;
  slot: number;
  total: number;
  name: string;
  color: string;
  autoLast: string | null;
  /** Verb for the next-round button, e.g. "Spin", "Drop", "Pull". */
  action?: string;
  onNext: () => void;
  onClose: () => void;
}) {
  const c = useColors();
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    turn.set(withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1));
  }, [reduce, turn]);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  const finished = slot >= total || !!autoLast;
  const label = slot === 1 ? 'First payout' : slot === total ? 'Last payout' : `${ordinal(slot)} payout`;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        <Confetti run={party} count={finished ? 90 : 50} />
        <Animated.View entering={ZoomIn.springify().damping(13)} style={[styles.popup, { backgroundColor: c.surface }]}>
          <Text variant="overline" tone="muted">
            We have a winner!
          </Text>

          <View style={styles.burst}>
            <Animated.View style={[StyleSheet.absoluteFill, rays]}>
              <Svg width={200} height={200} viewBox="0 0 200 200">
                {Array.from({ length: 12 }, (_, i) => (
                  <Path key={i} d={`M100 100 L${RAY(i * 30)} L${RAY(i * 30 + 15)} Z`} fill={color} opacity={0.16} />
                ))}
              </Svg>
            </Animated.View>
            <View style={[styles.avatar, { backgroundColor: color }]}>
              <Text style={{ fontFamily: font.black, fontSize: 36, lineHeight: 42 }} color="#fff">
                {initials}
              </Text>
            </View>
            <View style={[styles.medal, { backgroundColor: c.gold, borderColor: c.surface }]}>
              <Text style={{ fontFamily: font.black, fontSize: 16, lineHeight: 20 }} color="#5A3A00">
                #{slot}
              </Text>
            </View>
          </View>

          <Text variant="display" center numberOfLines={2} style={{ fontSize: 30, lineHeight: 36 }}>
            {name}
          </Text>
          <View style={[styles.slotChip, { backgroundColor: slot === 1 ? c.brandSoft : c.surfaceAlt }]}>
            <Feather name={slot === 1 ? 'award' : 'hash'} size={14} color={slot === 1 ? c.brandText : c.textMuted} />
            <Text variant="smallBold" color={slot === 1 ? c.brandText : c.textMuted}>
              Slot {slot} of {total} · {label}
            </Text>
          </View>
          {autoLast && (
            <Text variant="small" tone="muted" center>
              {autoLast} is the only one left and takes the last payout.
            </Text>
          )}

          <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
            {finished ? (
              <Button title="See payout order" icon="list" onPress={onClose} />
            ) : (
              <>
                <Button title={`${action} for slot #${slot + 1}`} icon="refresh-cw" onPress={onNext} />
                <Button title="Close" variant="secondary" onPress={onClose} />
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  popup: { width: '100%', maxWidth: 360, borderRadius: radius.xl, padding: 22, alignItems: 'center', gap: 10 },
  burst: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginVertical: -12 },
  avatar: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#FFFFFF' },
  medal: { position: 'absolute', bottom: 40, right: 44, minWidth: 44, height: 44, paddingHorizontal: 6, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  slotChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  order: { alignSelf: 'stretch', borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 6 },
  orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderTopWidth: 1, borderRadius: radius.sm },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
