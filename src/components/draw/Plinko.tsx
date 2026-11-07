import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

import { shortName, type DrawGameProps, type Participant } from '@/components/draw/common';
import { PayoutOrderList, RoundWinner, useRounds } from '@/components/draw/rounds';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { sfx } from '@/lib/sfx';
import { font, radius } from '@/theme/tokens';

const W = 320;
const ROWS = 9;
const TOP = 26;
const ROW_H = 30;
const PEG_GAP = 32;
const BIN_TOP = TOP + ROWS * ROW_H + 10;
const BIN_H = 78;
const H = BIN_TOP + BIN_H;
const BALL = 22;

/** Peg positions: offset every other row, like a real Plinko board. */
const PEGS = Array.from({ length: ROWS }, (_, r) => {
  const offset = r % 2 ? PEG_GAP / 2 : 0;
  const count = Math.floor((W - 20 - offset) / PEG_GAP) + 1;
  return Array.from({ length: count }, (_, k) => ({ x: 10 + offset + k * PEG_GAP, y: TOP + (r + 1) * ROW_H - 6 }));
});

/** Deterministic pseudo-random so a replay looks the same. */
function rnd(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Plinko Drop: a coin falls through the pegs, bouncing left and right, and lands in the bin of the
 * next person in the fair order. Each peg pings; the last rows play in slow motion with a drumroll.
 */
export function Plinko(props: DrawGameProps) {
  const { order } = props;
  const c = useColors();
  const reduce = useReducedMotion();
  const rounds = useRounds(props);
  const { revealed, winner, done, inPlay, colorOf } = rounds;
  const [dropping, setDropping] = useState(false);
  const [slowmo, setSlowmo] = useState(false);
  const [bins, setBins] = useState<Participant[]>(inPlay);

  const x = useSharedValue(W / 2 - BALL / 2);
  const y = useSharedValue(0);
  const spin = useSharedValue(0);

  const shown = dropping || winner ? bins : inPlay;
  const binW = W / Math.max(1, shown.length);

  const landed = (w: string) => {
    setDropping(false);
    setSlowmo(false);
    rounds.announce(w);
  };
  const ping = () => {
    sfx('ping', 0.5);
    haptic('light');
  };

  const drop = (list: Participant[] = inPlay) => {
    if (dropping || revealed.length >= order.length || !list.length) return;
    const w = order[revealed.length];
    const idx = list.findIndex((p) => p.id === w);
    const bw = W / list.length;
    const targetX = idx * bw + bw / 2 - BALL / 2;
    setBins(list);
    setDropping(true);
    sfx('whoosh', 0.6);

    const startX = W / 2 - BALL / 2 + (rnd(revealed.length + 1) - 0.5) * 60;
    x.set(startX);
    y.set(0);
    const seed = revealed.length * 13 + 5;
    const xs: number[] = [];
    const ys: number[] = [];
    const durs: number[] = [];
    for (let r = 1; r <= ROWS; r++) {
      const t = r / ROWS;
      // Drift toward the target bin, with random bounces that fade out near the bottom.
      const jitter = (rnd(seed + r) > 0.5 ? 1 : -1) * (PEG_GAP / 2) * (1 - t * 0.85);
      xs.push(Math.max(2, Math.min(W - BALL - 2, startX + (targetX - startX) * t + jitter)));
      ys.push(TOP + r * ROW_H - BALL - 6);
      durs.push(reduce ? 90 : r > ROWS - 3 ? 760 : 430); // slow motion for the last rows
    }
    if (!reduce) {
      const before = durs.slice(0, ROWS - 3).reduce((a, b) => a + b, 0);
      setTimeout(() => {
        setSlowmo(true);
        rounds.suspense(true);
      }, before);
    }

    // x moves in steps; y hops up a little off each peg, then falls to the next row.
    x.set(withSequence(...xs.map((v, i) => withTiming(v, { duration: durs[i], easing: Easing.inOut(Easing.quad) })), withTiming(targetX, { duration: reduce ? 120 : 700 })));
    y.set(
      withSequence(
        ...ys.flatMap((v, i) => [
          withTiming(v - 10, { duration: durs[i] * 0.3, easing: Easing.out(Easing.quad) }),
          withTiming(v, { duration: durs[i] * 0.7, easing: Easing.in(Easing.quad) }, (f) => {
            if (f) runOnJS(ping)();
          }),
        ]),
        withTiming(BIN_TOP + BIN_H - BALL - 10, { duration: reduce ? 120 : 700, easing: Easing.bezier(0.5, 0, 0.75, 0.4) }, (f) => {
          if (f) runOnJS(landed)(w);
        }),
      ),
    );
    spin.set(0);
    spin.set(withTiming(720, { duration: durs.reduce((a, b) => a + b, 0) + 700 }));
  };

  const next = () => {
    const rest = rounds.close();
    if (rest) setTimeout(() => drop(rest), 350);
  };

  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${spin.get()}deg` }] }));

  return (
    <View style={{ gap: 18, alignItems: 'center', alignSelf: 'stretch' }}>
      <View style={[styles.board, { backgroundColor: c.ink }]}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          {PEGS.flat().map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={4} fill="#FFFFFF" opacity={0.85} />
          ))}
        </Svg>

        {/* bins */}
        <View style={[styles.bins, { top: BIN_TOP }]}>
          {shown.map((p) => {
            const isWin = p.id === winner;
            return (
              <View key={p.id} style={[styles.bin, { width: binW, backgroundColor: colorOf(p.id), opacity: winner && !isWin ? 0.35 : 1 }, isWin && styles.binWin]}>
                <Text
                  numberOfLines={2}
                  center
                  style={{ fontFamily: font.bold, fontSize: shown.length > 6 ? 9 : 11, lineHeight: shown.length > 6 ? 11 : 13 }}
                  color="#FFFFFF">
                  {shortName(p.name, shown.length > 6 ? 6 : 9)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* the coin */}
        <Animated.View pointerEvents="none" style={[styles.ball, ballStyle]}>
          <Svg width={BALL} height={BALL}>
            <Circle cx={BALL / 2} cy={BALL / 2} r={BALL / 2 - 1} fill="#F6BE3B" stroke="#D9961A" strokeWidth={2} />
            <SvgText x={BALL / 2} y={BALL / 2 + 4} textAnchor="middle" fontSize={11} fontWeight="900" fill="#9A6406">
              ₱
            </SvgText>
          </Svg>
        </Animated.View>
      </View>

      <View style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
        {done && !winner ? (
          <Text variant="h2" tone="brand">
            All slots drawn!
          </Text>
        ) : dropping ? (
          <SuspenseText text={slowmo ? 'Where will it land' : `Dropping for ${slotLabel(revealed.length + 1, order.length)}`} fast={slowmo} />
        ) : (
          <Button title={`Drop for slot #${revealed.length + 1}`} icon="arrow-down-circle" variant="brand" full={false} style={{ paddingHorizontal: 28 }} disabled={!!winner} onPress={() => drop()} />
        )}
      </View>

      <PayoutOrderList rounds={rounds} order={order} pending="Drop to reveal" />
      {!dropping && <RoundWinner rounds={rounds} order={order} action="Drop" onNext={next} />}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { width: W, height: H, borderRadius: radius.lg, overflow: 'hidden' },
  bins: { position: 'absolute', left: 0, right: 0, height: BIN_H, flexDirection: 'row' },
  bin: { height: BIN_H, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8, paddingHorizontal: 2, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  binWin: { borderColor: '#FFE27A', borderWidth: 3 },
  ball: { position: 'absolute', left: 0, top: 0, width: BALL, height: BALL },
});
