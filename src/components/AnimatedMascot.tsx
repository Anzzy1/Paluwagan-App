import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from 'react-native-svg';

import { CREAM, FUR, FUR_DARK, GOLD, GOLD_DARK, Mascot, type MascotMood, type MascotPose } from '@/components/Mascot';

/**
 * Ipon, animated. Arms and the coin are separate layers that rotate around the shoulders,
 * so the squirrel can act things out:
 *   wave  – raises a paw and waves (kaway)
 *   toss  – flips its ₱ coin into the air and catches it
 *   cheer – pumps both arms while coins pop around it
 *   think – paw on chin, tapping (shown automatically while `busy`)
 * Every change of `trigger` plays `action` once; `repeatEvery` replays it on a timer.
 * Respects the system "reduce motion" setting.
 */
export type MascotAction = 'wave' | 'toss' | 'cheer' | 'think';

const VB = '0 0 210 220';
const ASPECT = 220 / 210;
// Shoulder pivots in viewBox units, as CSS-style transform origins.
const origin = (x: number, y: number) => `${((x / 210) * 100).toFixed(1)}% ${((y / 220) * 100).toFixed(1)}%`;
const R_SHOULDER = origin(138, 148);
const L_SHOULDER = origin(54, 148);
const DURATION: Record<MascotAction, number> = { wave: 1700, toss: 1350, cheer: 1600, think: 0 };
const FIRST = Symbol('first');

// ---------------------------------------------------------------- drawings (viewBox units)
const Coin = ({ cx = 96, cy = 168, r = 21 }: { cx?: number; cy?: number; r?: number }) => (
  <G>
    <Circle cx={cx} cy={cy} r={r} fill={GOLD} stroke={GOLD_DARK} strokeWidth={3} />
    <Circle cx={cx} cy={cy} r={r * 0.67} fill="none" stroke={GOLD_DARK} strokeWidth={2} opacity={0.6} />
    <SvgText x={cx} y={cy + r * 0.38} textAnchor="middle" fontWeight="900" fontSize={r * 0.95} fill={GOLD_DARK}>
      ₱
    </SvgText>
  </G>
);
const PawL = () => <Ellipse cx="72" cy="166" rx="10" ry="13" fill={FUR} stroke={FUR_DARK} strokeWidth={2.5} />;
const PawR = () => <Ellipse cx="120" cy="166" rx="10" ry="13" fill={FUR} stroke={FUR_DARK} strokeWidth={2.5} />;
const RaisedR = () => (
  <G>
    <Path d="M138 150 C 154 136, 160 118, 154 106" fill="none" stroke={FUR_DARK} strokeWidth={15} strokeLinecap="round" />
    <Circle cx="154" cy="102" r="10" fill={CREAM} stroke={FUR_DARK} strokeWidth={2} />
    <Path d="M149 95 L 148 90 M154 93 L 154 88 M159 95 L 160 90" stroke={FUR_DARK} strokeWidth={2} strokeLinecap="round" />
  </G>
);
const RaisedL = () => (
  <G>
    <Path d="M54 150 C 38 136, 32 118, 38 106" fill="none" stroke={FUR_DARK} strokeWidth={15} strokeLinecap="round" />
    <Circle cx="38" cy="102" r="10" fill={CREAM} stroke={FUR_DARK} strokeWidth={2} />
    <Path d="M33 95 L 32 90 M38 93 L 38 88 M43 95 L 44 90" stroke={FUR_DARK} strokeWidth={2} strokeLinecap="round" />
  </G>
);
const ThinkR = () => (
  <G>
    <Path d="M138 150 C 148 142, 146 132, 128 128" fill="none" stroke={FUR_DARK} strokeWidth={14} strokeLinecap="round" />
    <Circle cx="124" cy="128" r="9" fill={CREAM} stroke={FUR_DARK} strokeWidth={2} />
  </G>
);

function Layer({ size, pivot, style, children }: { size: number; pivot?: string; style?: object; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pivot ? { transformOrigin: pivot } : null, style]}>
      <Svg width={size} height={size * ASPECT} viewBox={VB}>
        {children}
      </Svg>
    </Animated.View>
  );
}

const rot = (v: SharedValue<number>) => () => {
  'worklet';
  return { transform: [{ rotate: `${v.get()}deg` }] };
};

// ---------------------------------------------------------------- component
export function AnimatedMascot({
  size = 120,
  mood = 'happy',
  pose = 'coin',
  trigger,
  action = 'wave',
  repeatEvery,
  busy = false,
  idle = true,
}: {
  size?: number;
  mood?: MascotMood;
  pose?: MascotPose;
  /** Any value; each change plays `action` once. */
  trigger?: unknown;
  action?: MascotAction;
  /** Replay `action` every N ms (e.g. a friendly wave on Home). */
  repeatEvery?: number;
  /** Thinking / loading: shows the "think" gesture until false. */
  busy?: boolean;
  idle?: boolean;
}) {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState<{ action: MascotAction; id: number } | null>(null);
  const [seen, setSeen] = useState<unknown>(FIRST);

  // A new trigger value starts the action (state adjustment during render, no effect needed).
  if (trigger !== seen) {
    setSeen(trigger);
    if (!reduce) setPlaying({ action, id: (playing?.id ?? 0) + 1 });
  }

  // Optional replay on a timer.
  useEffect(() => {
    if (!repeatEvery || reduce) return;
    const t = setInterval(() => setPlaying((p) => (p ? p : { action, id: Date.now() })), repeatEvery);
    return () => clearInterval(t);
  }, [repeatEvery, reduce, action]);

  const shown: MascotAction | null = busy && !reduce ? 'think' : (playing?.action ?? null);

  const float = useSharedValue(0);
  const hop = useSharedValue(0);
  const tilt = useSharedValue(0);
  const armR = useSharedValue(0);
  const armL = useSharedValue(0);
  const paws = useSharedValue(0);
  const coinY = useSharedValue(0);
  const coinFlip = useSharedValue(1);
  const sparkle = useSharedValue(0);

  // idle bob
  useEffect(() => {
    cancelAnimation(float);
    if (reduce || !idle) {
      float.set(withTiming(0, { duration: 200 }));
      return;
    }
    float.set(withRepeat(withSequence(withTiming(-3, { duration: 1500, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) })), -1));
  }, [idle, reduce, float]);

  // thinking: tap paw on chin, small head tilt
  useEffect(() => {
    if (!busy || reduce) return;
    armR.set(withRepeat(withSequence(withTiming(-8, { duration: 220 }), withTiming(4, { duration: 220 })), -1, true));
    tilt.set(withTiming(-5, { duration: 300 }));
    return () => {
      cancelAnimation(armR);
      armR.set(0);
      tilt.set(withTiming(0, { duration: 200 }));
    };
  }, [busy, reduce, armR, tilt]);

  // one-shot actions
  const playId = playing?.id;
  const playAction = playing?.action;
  useEffect(() => {
    if (!playAction) return;
    const s = size;
    const jump = (h: number) => withSequence(withTiming(-s * h, { duration: 170, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 7, stiffness: 200 }));

    if (playAction === 'wave') {
      armR.set(-30);
      armR.set(withSequence(withTiming(18, { duration: 200 }), ...Array.from({ length: 3 }, () => [withTiming(-14, { duration: 230 }), withTiming(18, { duration: 230 })]).flat(), withTiming(0, { duration: 200 })));
      tilt.set(withSequence(withTiming(4, { duration: 300 }), withDelay(1000, withTiming(0, { duration: 300 }))));
    } else if (playAction === 'toss') {
      paws.set(withSequence(withTiming(6, { duration: 120 }), withTiming(-s * 0.08, { duration: 110 }), withSpring(0, { damping: 9 })));
      coinY.set(withSequence(withTiming(4, { duration: 120 }), withTiming(-s * 0.62, { duration: 420, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 380, easing: Easing.in(Easing.cubic) }), withSpring(0)));
      coinFlip.set(withSequence(withDelay(120, withRepeat(withSequence(withTiming(-1, { duration: 100 }), withTiming(1, { duration: 100 })), 4)), withTiming(1, { duration: 50 })));
      hop.set(withDelay(940, jump(0.05)));
    } else if (playAction === 'cheer') {
      const pump = (a: number, b: number) => withSequence(...Array.from({ length: 4 }, () => [withTiming(a, { duration: 170 }), withTiming(b, { duration: 170 })]).flat(), withTiming(0, { duration: 180 }));
      armR.set(pump(-22, 8));
      armL.set(pump(22, -8));
      hop.set(withSequence(jump(0.12), withDelay(60, jump(0.08))));
      sparkle.set(0);
      sparkle.set(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }));
    }
    const t = setTimeout(() => setPlaying((p) => (p?.id === playId ? null : p)), DURATION[playAction]);
    return () => clearTimeout(t);
  }, [playId, playAction, size, armR, armL, paws, coinY, coinFlip, hop, tilt, sparkle]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.get() + hop.get() }, { rotate: `${tilt.get()}deg` }] }));
  const armRStyle = useAnimatedStyle(rot(armR));
  const armLStyle = useAnimatedStyle(rot(armL));
  const pawsStyle = useAnimatedStyle(() => ({ transform: [{ translateY: paws.get() }] }));
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: coinY.get() }, { scaleX: coinFlip.get() }] }));
  const sparkStyle = (dx: number, dy: number) => () => {
    'worklet';
    const p = sparkle.get();
    return { opacity: p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0, transform: [{ translateX: dx * p }, { translateY: dy * p }, { scale: 0.4 + p * 0.8 }] };
  };
  const spark1 = useAnimatedStyle(sparkStyle(-size * 0.32, -size * 0.42));
  const spark2 = useAnimatedStyle(sparkStyle(size * 0.34, -size * 0.5));
  const spark3 = useAnimatedStyle(sparkStyle(size * 0.02, -size * 0.62));

  const face: MascotMood = shown === 'cheer' || shown === 'toss' ? (mood === 'happy' ? 'excited' : mood) : mood;

  // which arm layers to draw
  let arms: ReactNode;
  if (shown === 'wave') {
    arms = (
      <>
        <Layer size={size}>
          <Coin />
          <PawL />
        </Layer>
        <Layer size={size} pivot={R_SHOULDER} style={armRStyle}>
          <RaisedR />
        </Layer>
      </>
    );
  } else if (shown === 'think') {
    arms = (
      <>
        <Layer size={size}>
          <Coin />
          <PawL />
        </Layer>
        <Layer size={size} pivot={R_SHOULDER} style={armRStyle}>
          <ThinkR />
        </Layer>
      </>
    );
  } else if (shown === 'cheer' || (!shown && pose === 'cheer')) {
    arms = (
      <>
        <Layer size={size} pivot={L_SHOULDER} style={armLStyle}>
          <RaisedL />
        </Layer>
        <Layer size={size} pivot={R_SHOULDER} style={armRStyle}>
          <RaisedR />
        </Layer>
      </>
    );
  } else {
    // resting / toss: holding the coin with both paws
    arms = (
      <>
        <Layer size={size} style={coinStyle}>
          <Coin />
        </Layer>
        <Layer size={size} style={pawsStyle}>
          <PawL />
          <PawR />
        </Layer>
      </>
    );
  }

  const coinSize = size * 0.16;
  return (
    <View style={{ width: size, height: size * ASPECT }}>
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Mascot size={size} mood={face} pose={pose} arms={false} />
        {arms}
      </Animated.View>
      {shown === 'cheer' &&
        [spark1, spark2, spark3].map((st, i) => (
          <Animated.View key={i} pointerEvents="none" style={[styles.spark, { left: size / 2 - coinSize / 2, top: size * 0.45, width: coinSize, height: coinSize }, st]}>
            <Svg width={coinSize} height={coinSize} viewBox="0 0 44 44">
              <Coin cx={22} cy={22} r={19} />
            </Svg>
          </Animated.View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  spark: { position: 'absolute' },
});
