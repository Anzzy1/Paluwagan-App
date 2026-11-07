import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { Confetti } from '@/components/ui/Confetti';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { font, radius } from '@/theme/tokens';

const SIZE = 300;
const RIM = 14; // light-bulb ring
const R = SIZE / 2 - RIM - 2;
const C = SIZE / 2;
const BULBS = 20;
const HUB = 34;

function point(deg: number, r = R) {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function slicePath(a0: number, a1: number) {
  if (a1 - a0 >= 359.99) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
  const p0 = point(a0);
  const p1 = point(a1);
  return `M ${C} ${C} L ${p0.x} ${p0.y} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/**
 * Spin the Wheel: one spin per payout slot. The pointer always lands on the next person in the
 * fair (pre-computed) order; the motion is only for show:
 * wind-up → fast spin → sudden brake → slow creep onto the winner, with a ticking pointer,
 * chasing rim lights, a highlighted winning slice and confetti.
 */
export function WheelDraw({ participants, order, onDone }: DrawGameProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null); // lit on the wheel + shown in the popup until closed
  const [party, setParty] = useState(0);
  const [lights, setLights] = useState(0);
  const [creeping, setCreeping] = useState(false); // the slow final crawl

  const rot = useSharedValue(0);
  const flap = useSharedValue(0);
  const hubPulse = useSharedValue(1);
  const lastTick = useRef(0);

  // On the wheel: everyone not yet drawn, plus the current winner until the announcement ends.
  const onWheel = participants.filter((p) => !revealed.includes(p.id) || p.id === winner);
  const n = onWheel.length;
  const step = 360 / Math.max(1, n);
  const colorOf = (id: string) => colorAt(participants.findIndex((p) => p.id === id));
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? '';
  const done = revealed.length >= order.length;

  // Chasing rim lights: fast while spinning, a slow twinkle otherwise.
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setLights((x) => x + 1), spinning ? 90 : 650);
    return () => clearInterval(t);
  }, [spinning, reduce]);

  // Breathing SPIN hub while waiting.
  useEffect(() => {
    if (reduce || spinning || done) {
      hubPulse.set(withTiming(1));
      return;
    }
    hubPulse.set(withRepeat(withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })), -1));
  }, [spinning, done, reduce, hubPulse]);

  const tick = () => {
    const now = Date.now();
    if (now - lastTick.current > 70) {
      lastTick.current = now;
      haptic('light');
    }
  };

  // The pointer flaps each time a slice border passes under it.
  useAnimatedReaction(
    () => Math.floor(rot.get() / step),
    (cur, prev) => {
      if (prev === null || cur === prev) return;
      flap.set(withSequence(withTiming(-26, { duration: 35 }), withSpring(0, { damping: 7, stiffness: 420 })));
      runOnJS(tick)();
    },
    [step],
  );

  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
  const pointerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${flap.get()}deg` }] }));
  const hubStyle = useAnimatedStyle(() => ({ transform: [{ scale: hubPulse.get() }] }));

  const announce = (w: string) => {
    haptic('success');
    setSpinning(false);
    setCreeping(false);
    setWinner(w);
    setParty((x) => x + 1);
    const next = [...revealed, w];
    // When one person is left, they take the last slot automatically.
    const left = participants.filter((p) => !next.includes(p.id));
    if (left.length === 1) next.push(left[0].id);
    setRevealed(next);
  };

  /** Spin for the next slot. `list` is who is on the wheel (defaults to what's shown now). */
  const spin = (list = onWheel) => {
    if (spinning || revealed.length >= order.length) return;
    const step = 360 / Math.max(1, list.length);
    const w = order[revealed.length];
    const idx = list.findIndex((p) => p.id === w);
    const wobble = (((revealed.length + 1) * 37) % 10) / 10 - 0.5; // land off-centre so it feels natural
    const center = (idx + 0.5) * step + wobble * step * 0.55;
    const target = 360 * 7 + ((360 - center) % 360);
    setSpinning(true);
    haptic('medium');

    if (reduce) {
      rot.set(withTiming(target, { duration: 1200, easing: Easing.out(Easing.cubic) }, (f) => f && runOnJS(announce)(w)));
      return;
    }
    // Brake point: the wheel spins fast up to here, then suddenly slows and creeps the last bit.
    // Brake early so the wheel crawls past several names before it settles: that's the tension.
    const brake = target - Math.min(460, 220 + step * 2.2);
    setCreeping(false);
    setTimeout(() => setCreeping(true), 300 + 1000 + 2800);
    rot.set(
      withSequence(
        withTiming(-24, { duration: 300, easing: Easing.out(Easing.quad) }), // wind-up
        withTiming(540, { duration: 1000, easing: Easing.in(Easing.quad) }), // launch
        withTiming(brake, { duration: 2800, easing: Easing.linear }), // full speed
        withTiming(target, { duration: 6200, easing: Easing.bezier(0.08, 0.75, 0.12, 1) }, (f) => {
          if (f) runOnJS(announce)(w);
        }), // sudden brake + creep
      ),
    );
  };

  /** Close the winner popup; the winning slice leaves the wheel. Optionally spin again right away. */
  const closeWin = (spinNext: boolean) => {
    setWinner(null);
    rot.set(0);
    if (revealed.length >= order.length) {
      onDone();
      return;
    }
    if (spinNext) {
      const rest = participants.filter((p) => !revealed.includes(p.id));
      setTimeout(() => spin(rest), 300);
    }
  };

  const fontSize = n > 10 ? 10 : n > 6 ? 12 : 14;
  const lastSlot = order.length;

  return (
    <View style={{ gap: 18, alignItems: 'center', alignSelf: 'stretch' }}>
      <View style={{ width: SIZE, height: SIZE + 18 }}>
        <Animated.View style={[{ width: SIZE, height: SIZE, marginTop: 18 }, wheelStyle]}>
          <Svg width={SIZE} height={SIZE}>
            {/* rim with bulbs */}
            <Circle cx={C} cy={C} r={C - 1} fill={c.ink} />
            <Circle cx={C} cy={C} r={C - RIM / 2 - 1} fill="none" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={RIM - 4} />
            {Array.from({ length: BULBS }, (_, i) => {
              const pt = point((i * 360) / BULBS, C - RIM / 2 - 1);
              const on = (i + lights) % 2 === 0;
              return <Circle key={i} cx={pt.x} cy={pt.y} r={3.6} fill={on ? '#FFE27A' : '#FFFFFF'} opacity={on ? 1 : 0.35} />;
            })}

            {onWheel.map((p, i) => {
              const a0 = i * step;
              const mid = a0 + step / 2;
              const isWin = p.id === winner;
              const dim = winner && !isWin;
              return (
                <G key={p.id} opacity={dim ? 0.35 : 1}>
                  <Path d={slicePath(a0, a0 + step)} fill={colorOf(p.id)} stroke="#FFFFFF" strokeWidth={isWin ? 4 : 2} />
                  {/* Labels are upright when their slice is under the pointer, so the winner reads correctly. */}
                  <G transform={`rotate(${mid} ${C} ${C})`}>
                    <SvgText x={C} y={C - R * 0.6 + fontSize / 3} fill="#FFFFFF" fontSize={isWin ? fontSize + 2 : fontSize} fontWeight="800" textAnchor="middle" fontFamily={font.bold}>
                      {shortName(p.name, n > 8 ? 8 : 11)}
                    </SvgText>
                  </G>
                </G>
              );
            })}
            {/* soft inner shading for depth */}
            <Circle cx={C} cy={C} r={R} fill="none" stroke="#000000" strokeOpacity={0.12} strokeWidth={6} />
          </Svg>
        </Animated.View>

        {/* SPIN hub (doesn't rotate) */}
        <Animated.View style={[styles.hubWrap, hubStyle]}>
          <PressableScale onPress={() => spin()} disabled={spinning || !!winner || done} dimWhenDisabled={false} hapticOnPress={false} scaleTo={0.9} accessibilityLabel="Spin" style={[styles.hub, { borderColor: c.ink }]}>
            <Text variant="caption" style={{ fontFamily: font.black, fontSize: 13, letterSpacing: 0.5 }} color={c.ink}>
              {done ? 'DONE' : spinning ? '•••' : 'SPIN'}
            </Text>
          </PressableScale>
        </Animated.View>

        {/* pointer: pivots at its top and flaps on every slice */}
        <Animated.View style={[styles.pointer, pointerStyle]}>
          <Svg width={42} height={46} viewBox="0 0 42 46">
            <Path d="M21 44 6 12a15 15 0 1 1 30 0z" fill={c.gold} stroke={c.ink} strokeWidth={3.5} strokeLinejoin="round" />
            <Circle cx={21} cy={13} r={5} fill={c.ink} />
          </Svg>
        </Animated.View>
      </View>

      <View style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
        {done && !winner ? (
          <Animated.View entering={FadeIn}>
            <Text variant="h2" tone="brand">
              All slots drawn!
            </Text>
          </Animated.View>
        ) : spinning ? (
          <SuspenseText
            text={creeping ? 'Slowing down… who will it be' : `Spinning for ${slotLabel(revealed.length + 1, order.length)}`}
            fast={creeping}
          />
        ) : (
          <Button
            title={`Spin for slot #${revealed.length + 1}`}
            icon="refresh-cw"
            variant="brand"
            onPress={() => spin()}
            disabled={spinning || !!winner}
            full={false}
            style={{ paddingHorizontal: 28, alignSelf: 'center' }}
          />
        )}
      </View>

      {/* payout order, first to last */}
      <View style={[styles.order, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.orderHead}>
          <Text variant="h3">Payout order</Text>
          <Text variant="small" tone="muted">
            {Math.min(revealed.length, lastSlot)} of {lastSlot} drawn
          </Text>
        </View>
        {order.map((_, i) => {
          const id = revealed[i];
          const isNew = id && id === winner;
          const label = i === 0 ? 'First payout' : i === lastSlot - 1 ? 'Last payout' : null;
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
                {id ? nameOf(id) : 'Spin to reveal'}
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

      {winner && !spinning && (
        <WinnerPopup
          party={party}
          slot={revealed.indexOf(winner) + 1}
          total={order.length}
          name={nameOf(winner)}
          color={colorOf(winner)}
          autoLast={revealed.length === order.length && revealed[revealed.length - 1] !== winner ? nameOf(revealed[revealed.length - 1]) : null}
          onNext={() => closeWin(true)}
          onClose={() => closeWin(false)}
        />
      )}
    </View>
  );
}

const RAY = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(100 + 100 * Math.sin(a)).toFixed(1)} ${(100 - 100 * Math.cos(a)).toFixed(1)}`;
};

/** "We have a winner" popup, like the classic name wheels, with a turning sunburst and confetti. */
function WinnerPopup({
  party,
  slot,
  total,
  name,
  color,
  autoLast,
  onNext,
  onClose,
}: {
  party: number;
  slot: number;
  total: number;
  name: string;
  color: string;
  autoLast: string | null;
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
                <Button title={`Spin for slot #${slot + 1}`} icon="refresh-cw" onPress={onNext} />
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
  pointer: { position: 'absolute', top: 0, left: SIZE / 2 - 21, width: 42, height: 46, transformOrigin: '50% 13px' },
  hubWrap: { position: 'absolute', top: 18 + C - HUB, left: C - HUB, width: HUB * 2, height: HUB * 2 },
  hub: { width: HUB * 2, height: HUB * 2, borderRadius: HUB, backgroundColor: '#FFFFFF', borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
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
