import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { shortName, type DrawGameProps, type Participant } from '@/components/draw/common';
import { PayoutOrderList, RoundWinner, useRounds } from '@/components/draw/rounds';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { sfx } from '@/lib/sfx';
import { font } from '@/theme/tokens';

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

/**
 * Spin the Wheel: one spin per payout slot. The pointer always lands on the next person in the
 * fair (pre-computed) order; the motion is only for show:
 * wind-up → fast spin → sudden brake → slow crawl onto the winner, with a ticking pointer,
 * chasing rim lights, a drumroll while it crawls, and a fanfare + popup for the winner.
 */
export function WheelDraw(props: DrawGameProps) {
  const { order } = props;
  const c = useColors();
  const reduce = useReducedMotion();
  const rounds = useRounds(props);
  const { revealed, winner, done, inPlay: onWheel, colorOf } = rounds;
  const [spinning, setSpinning] = useState(false);
  const [lights, setLights] = useState(0);
  const [creeping, setCreeping] = useState(false); // the slow final crawl

  const rot = useSharedValue(0);
  const flap = useSharedValue(0);
  const hubPulse = useSharedValue(1);
  const lastTick = useRef(0);

  const n = onWheel.length;
  const step = 360 / Math.max(1, n);

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
    if (now - lastTick.current > 45) {
      lastTick.current = now;
      sfx('tick', 0.55);
      haptic('light');
    }
  };

  // The pointer flaps (and clicks) each time a slice border passes under it.
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

  const landed = (w: string) => {
    setSpinning(false);
    setCreeping(false);
    rounds.announce(w);
  };

  /** Spin for the next slot. `list` is who is on the wheel (defaults to what's shown now). */
  const spin = (list: Participant[] = onWheel) => {
    if (spinning || revealed.length >= order.length) return;
    const st = 360 / Math.max(1, list.length);
    const w = order[revealed.length];
    const idx = list.findIndex((p) => p.id === w);
    const wobble = (((revealed.length + 1) * 37) % 10) / 10 - 0.5; // land off-centre so it feels natural
    const center = (idx + 0.5) * st + wobble * st * 0.55;
    const target = 360 * 7 + ((360 - center) % 360);
    setSpinning(true);
    haptic('medium');
    sfx('whoosh');

    if (reduce) {
      rot.set(withTiming(target, { duration: 1200, easing: Easing.out(Easing.cubic) }, (f) => f && runOnJS(landed)(w)));
      return;
    }
    // Brake early so the wheel crawls past several names before it settles: that's the tension.
    const brake = target - Math.min(460, 220 + st * 2.2);
    setCreeping(false);
    setTimeout(() => {
      setCreeping(true);
      rounds.suspense(true);
    }, 300 + 1000 + 2800);
    rot.set(
      withSequence(
        withTiming(-24, { duration: 300, easing: Easing.out(Easing.quad) }), // wind-up
        withTiming(540, { duration: 1000, easing: Easing.in(Easing.quad) }), // launch
        withTiming(brake, { duration: 2800, easing: Easing.linear }), // full speed
        withTiming(target, { duration: 6200, easing: Easing.bezier(0.08, 0.75, 0.12, 1) }, (f) => {
          if (f) runOnJS(landed)(w);
        }), // sudden brake + crawl
      ),
    );
  };

  const next = () => {
    rot.set(0);
    const rest = rounds.close();
    if (rest) setTimeout(() => spin(rest), 300);
  };

  const fontSize = n > 10 ? 10 : n > 6 ? 12 : 14;

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
          <SuspenseText text={creeping ? 'Slowing down… who will it be' : `Spinning for ${slotLabel(revealed.length + 1, order.length)}`} fast={creeping} />
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

      <PayoutOrderList rounds={rounds} order={order} pending="Spin to reveal" />
      {!spinning && <RoundWinner rounds={rounds} order={order} action="Spin" onNext={next} />}
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: { position: 'absolute', top: 0, left: SIZE / 2 - 21, width: 42, height: 46, transformOrigin: '50% 13px' },
  hubWrap: { position: 'absolute', top: 18 + C - HUB, left: C - HUB, width: HUB * 2, height: HUB * 2 },
  hub: { width: HUB * 2, height: HUB * 2, borderRadius: HUB, backgroundColor: '#FFFFFF', borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
});
