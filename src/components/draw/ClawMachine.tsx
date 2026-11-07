import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { type DrawGameProps, type Participant } from '@/components/draw/common';
import { PayoutOrderList, RoundWinner, useRounds } from '@/components/draw/rounds';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { loop, sfx } from '@/lib/sfx';
import { font, radius } from '@/theme/tokens';

const W = 320;
const H = 300;
const CAP = 50; // capsule size
const CLAW_W = 56;
const REST_Y = 18; // cable length when parked
const CHUTE_X = 14;
const CHUTE_W = 70;

const initials = (n: string) =>
  n
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/** Capsules sit in a little pile on the right; positions are stable for a given order of players. */
function layout(list: Participant[]) {
  const cols = 4;
  const left = CHUTE_X + CHUTE_W + 14;
  const span = W - left - 12;
  const gap = span / cols;
  return list.map((p, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { id: p.id, x: left + col * gap + (row % 2 ? gap / 2 : 0), y: H - CAP - 12 - row * (CAP - 10) };
  });
}

/** Deterministic pseudo-random so replays look the same. */
function rnd(seed: number) {
  const x = Math.sin(seed * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Claw Machine: the claw teases back and forth over the capsules, lines up over the next person in
 * the fair order, drops, grabs, wobbles on the way up, and releases the capsule into the prize chute.
 */
export function ClawMachine(props: DrawGameProps) {
  const { order } = props;
  const reduce = useReducedMotion();
  const rounds = useRounds(props);
  const { revealed, winner, done, inPlay, colorOf, nameOf } = rounds;
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'hunt' | 'grab' | 'carry'>('idle');
  const [held, setHeld] = useState<string | null>(null);

  const clawX = useSharedValue(W / 2 - CLAW_W / 2);
  const cable = useSharedValue(REST_Y);
  const grip = useSharedValue(0); // 0 open, 1 closed
  const sway = useSharedValue(0);
  const fall = useSharedValue(0); // capsule drop into the chute after release

  // Positions come from everyone in play so the pile doesn't shuffle; the held capsule and the
  // winner (now in the prize chute) are drawn separately.
  const caps = layout(inPlay).filter((cp) => !(busy && cp.id === held) && cp.id !== winner);

  const finish = (w: string) => {
    loop('motor', false);
    setBusy(false);
    setPhase('idle');
    setHeld(null);
    rounds.announce(w);
  };
  const grabbed = (w: string) => {
    sfx('clunk');
    haptic('medium');
    setHeld(w);
    setPhase('carry');
  };
  const setP = (p: 'hunt' | 'grab') => {
    setPhase(p);
    if (p === 'grab') rounds.suspense(true);
  };

  const play = (list: Participant[] = inPlay) => {
    if (busy || revealed.length >= order.length || !list.length) return;
    const w = order[revealed.length];
    const target = layout(list).find((c) => c.id === w)!;
    const tx = target.x + CAP / 2 - CLAW_W / 2;
    const reach = target.y - 4 - 36; // cable length so the claw closes around the capsule
    const seed = revealed.length * 7 + 3;
    const k = reduce ? 0.25 : 1;

    setBusy(true);
    setPhase('hunt');
    fall.set(0);
    grip.set(0);
    loop('motor', true, 0.5);
    haptic('light');

    // Tease: sweep over a few random capsules before committing.
    const teases = [0, 1, 2].map((i) => 110 + rnd(seed + i) * (W - 160));
    const hunt = [...teases.map((v) => withTiming(v, { duration: 900 * k, easing: Easing.inOut(Easing.quad) })), withTiming(tx, { duration: 1300 * k, easing: Easing.inOut(Easing.cubic) })];
    const huntMs = (900 * 3 + 1300) * k;
    clawX.set(
      withSequence(
        ...hunt,
        withDelay((600 + 1500 + 400 + 1500) * k, withTiming(CHUTE_X + CHUTE_W / 2 - CLAW_W / 2, { duration: 1600 * k, easing: Easing.inOut(Easing.quad) })),
      ),
    );
    // Pause, drop, grab, lift.
    setTimeout(() => setP('grab'), huntMs);
    cable.set(
      withSequence(
        withDelay(huntMs + 600 * k, withTiming(reach, { duration: 1500 * k, easing: Easing.in(Easing.quad) })),
        withDelay(400 * k, withTiming(REST_Y + 6, { duration: 1500 * k, easing: Easing.out(Easing.quad) })),
      ),
    );
    grip.set(
      withDelay(
        huntMs + (600 + 1500) * k,
        withTiming(1, { duration: 300 }, (f) => {
          if (f) runOnJS(grabbed)(w);
        }),
      ),
    );
    // Wobble on the way up: will it hold?
    sway.set(
      withDelay(
        huntMs + (600 + 1500 + 400) * k,
        withSequence(
          ...[6, -6, 4, -4, 2, 0].map((d) => withTiming(reduce ? 0 : d, { duration: 250 })),
        ),
      ),
    );
    // Release over the chute and let the capsule fall in.
    const releaseAt = huntMs + (600 + 1500 + 400 + 1500 + 1600) * k;
    setTimeout(() => {
      grip.set(withTiming(0, { duration: 200 }));
      sfx('pop');
      fall.set(withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) }, (f) => f && runOnJS(finish)(w)));
    }, releaseAt);
  };

  const next = () => {
    const rest = rounds.close();
    clawX.set(W / 2 - CLAW_W / 2);
    cable.set(REST_Y);
    if (rest) setTimeout(() => play(rest), 350);
  };

  const clawStyle = useAnimatedStyle(() => ({ transform: [{ translateX: clawX.get() }, { rotate: `${sway.get()}deg` }] }));
  const cableStyle = useAnimatedStyle(() => ({ height: cable.get() }));
  const leftProng = useAnimatedStyle(() => ({ transform: [{ rotate: `${18 - grip.get() * 22}deg` }] }));
  const rightProng = useAnimatedStyle(() => ({ transform: [{ rotate: `${-18 + grip.get() * 22}deg` }] }));
  const heldStyle = useAnimatedStyle(() => ({
    opacity: 1 - fall.get() * 0.2,
    transform: [{ translateY: cable.get() + 30 + fall.get() * (H - 70 - cable.get()) }],
  }));

  return (
    <View style={{ gap: 18, alignItems: 'center', alignSelf: 'stretch' }}>
      <View style={styles.cabinet}>
        <LinearGradient colors={['#7350E8', '#4B2BB8']} style={styles.topBar}>
          <Text style={{ fontFamily: font.black, fontSize: 16, letterSpacing: 2 }} color="#FFE27A">
            CLAW BUNUTAN
          </Text>
        </LinearGradient>
        <LinearGradient colors={['#EAF1FE', '#F1ECFF']} style={styles.glass}>
          {/* rail */}
          <View style={styles.rail} />

          {/* prize chute */}
          <View style={[styles.chute, { left: CHUTE_X, width: CHUTE_W }]}>
            <Text variant="caption" color="#4B2BB8" style={{ fontWeight: '800' }}>
              PRIZE
            </Text>
          </View>

          {winner && (
            <View style={[styles.capsule, { left: CHUTE_X + (CHUTE_W - CAP) / 2, top: H - CAP - 8, backgroundColor: colorOf(winner) }]}>
              <View style={styles.capsuleShine} />
              <Text style={{ fontFamily: font.black, fontSize: 15 }} color="#FFFFFF">
                {initials(nameOf(winner))}
              </Text>
            </View>
          )}

          {/* capsules */}
          {caps.map((cp) => {
            return (
              <View key={cp.id} style={[styles.capsule, { left: cp.x, top: cp.y, backgroundColor: colorOf(cp.id) }, winner && { opacity: 0.4 }]}>
                <View style={styles.capsuleShine} />
                <Text style={{ fontFamily: font.black, fontSize: 15 }} color="#FFFFFF">
                  {initials(nameOf(cp.id))}
                </Text>
              </View>
            );
          })}

          {/* claw (+ the capsule it's holding) */}
          <Animated.View style={[styles.clawWrap, clawStyle]} pointerEvents="none">
            <Animated.View style={[styles.cable, cableStyle]} />
            <View style={styles.head}>
              <Svg width={CLAW_W} height={14}>
                <Rect x={8} y={0} width={CLAW_W - 16} height={14} rx={5} fill="#4B5563" />
              </Svg>
              <View style={styles.prongs}>
                <Animated.View style={[styles.prong, { transformOrigin: '50% 0%' }, leftProng]}>
                  <Svg width={14} height={30}>
                    <Path d="M7 0v20q0 8 7 10" stroke="#6B7280" strokeWidth={5} fill="none" strokeLinecap="round" />
                  </Svg>
                </Animated.View>
                <Animated.View style={[styles.prong, { transformOrigin: '50% 0%' }, rightProng]}>
                  <Svg width={14} height={30}>
                    <Path d="M7 0v20q0 8 -7 10" stroke="#6B7280" strokeWidth={5} fill="none" strokeLinecap="round" />
                  </Svg>
                </Animated.View>
              </View>
            </View>
            {held && (
              <Animated.View style={[styles.heldCap, { backgroundColor: colorOf(held) }, heldStyle]}>
                <View style={styles.capsuleShine} />
                <Text style={{ fontFamily: font.black, fontSize: 15 }} color="#FFFFFF">
                  {initials(nameOf(held))}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </LinearGradient>
      </View>

      <View style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
        {done && !winner ? (
          <Text variant="h2" tone="brand">
            All slots drawn!
          </Text>
        ) : busy ? (
          <SuspenseText
            text={phase === 'hunt' ? `Hunting for ${slotLabel(revealed.length + 1, order.length)}` : phase === 'grab' ? 'Going down… who did it grab' : 'Will it hold'}
            fast={phase !== 'hunt'}
          />
        ) : (
          <Button title={`Grab for slot #${revealed.length + 1}`} icon="download" variant="brand" full={false} style={{ paddingHorizontal: 28 }} disabled={!!winner} onPress={() => play()} />
        )}
      </View>

      <PayoutOrderList rounds={rounds} order={order} pending="Grab to reveal" />
      {!busy && <RoundWinner rounds={rounds} order={order} action="Grab" onNext={next} />}
    </View>
  );
}

const styles = StyleSheet.create({
  cabinet: { width: W + 16, borderRadius: radius.xl, backgroundColor: '#4B2BB8', padding: 8, gap: 8 },
  topBar: { borderRadius: 14, alignItems: 'center', paddingVertical: 8 },
  glass: { width: W, height: H, borderRadius: 16, overflow: 'hidden' },
  rail: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: '#9CA3AF' },
  chute: { position: 'absolute', bottom: 0, height: 70, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: 'rgba(75,43,184,0.15)', borderWidth: 2, borderBottomWidth: 0, borderColor: '#7350E8', alignItems: 'center', justifyContent: 'center' },
  capsule: { position: 'absolute', width: CAP, height: CAP, borderRadius: CAP / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  capsuleShine: { position: 'absolute', top: 6, left: 10, width: 14, height: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.45)' },
  clawWrap: { position: 'absolute', top: 0, left: 0, width: CLAW_W, alignItems: 'center', transformOrigin: '50% 0%' },
  cable: { width: 3, backgroundColor: '#6B7280' },
  head: { alignItems: 'center' },
  prongs: { flexDirection: 'row', gap: 14, marginTop: -2 },
  prong: { width: 14, height: 30 },
  heldCap: { position: 'absolute', top: 0, left: (CLAW_W - CAP) / 2, width: CAP, height: CAP, borderRadius: CAP / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
});
