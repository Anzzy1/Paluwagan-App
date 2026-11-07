import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { shortName, type DrawGameProps, type Participant } from '@/components/draw/common';
import { PayoutOrderList, RoundWinner, useRounds } from '@/components/draw/rounds';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { sfx } from '@/lib/sfx';
import { font, radius } from '@/theme/tokens';

const ROW = 64; // reel row height
const REPS = 9; // how many times the names repeat on the strip
const SYMBOLS = ['₱', '★', '7', '◆', '₱', '♥', '★', '7'];
const SYMBOL_COLORS: Record<string, string> = { '₱': '#16A34A', '★': '#F5B53D', '7': '#E5365F', '◆': '#2F6FEB', '♥': '#E5365F' };
const BULBS = 11;

/** A strip of symbols that spins and stops on ₱ (purely decorative side reels). */
function SymbolReel({ go, stopAt }: { go: number; stopAt: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!go) return;
    // Land on a ₱ near the end of a long strip.
    const target = (SYMBOLS.length * 6 + 0) * ROW;
    y.set(0);
    y.set(withTiming(-target + ROW, { duration: stopAt, easing: Easing.bezier(0.15, 0.6, 0.25, 1) }, (f) => f && runOnJS(sfx)('clunk', 0.8)));
  }, [go, stopAt, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const strip = Array.from({ length: SYMBOLS.length * 7 }, (_, i) => SYMBOLS[i % SYMBOLS.length]);
  return (
    <View style={styles.sideReel}>
      <Animated.View style={style}>
        {strip.map((s, i) => (
          <View key={i} style={styles.cell}>
            <Text style={{ fontFamily: font.black, fontSize: 30, lineHeight: 36 }} color={SYMBOL_COLORS[s]}>
              {s}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Slot Machine: pull the lever, the ₱ reels lock in first, then the name reel crawls to a stop on
 * the next person in the fair order. Ticks as names pass, drumroll on the final crawl, fanfare.
 */
export function SlotMachine(props: DrawGameProps) {
  const { order } = props;
  const reduce = useReducedMotion();
  const rounds = useRounds(props);
  const { revealed, winner, done, inPlay, colorOf } = rounds;
  const [spinning, setSpinning] = useState(false);
  const [go, setGo] = useState(0);
  const [crawl, setCrawl] = useState(false);
  const [lights, setLights] = useState(0);
  const [strip, setStrip] = useState<Participant[]>(inPlay);

  const y = useSharedValue(0);
  const lever = useSharedValue(0);
  const lastTick = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setLights((x) => x + 1), spinning ? 110 : winner ? 140 : 700);
    return () => clearInterval(t);
  }, [spinning, winner, reduce]);

  const tick = () => {
    const now = Date.now();
    if (now - lastTick.current > 40) {
      lastTick.current = now;
      sfx('tick', 0.45);
    }
  };
  useAnimatedReaction(
    () => Math.floor(-y.get() / ROW),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(tick)();
    },
  );

  // Popup closed: rewind the reel to the top of the new strip.
  useEffect(() => {
    if (!winner && !spinning) y.set(0);
  }, [winner, spinning, y]);

  const reelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const leverStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${lever.get() * 70}deg` }] }));

  const landed = (w: string) => {
    setSpinning(false);
    setCrawl(false);
    rounds.announce(w);
  };

  const pull = (list: Participant[] = inPlay) => {
    if (spinning || revealed.length >= order.length || !list.length) return;
    const w = order[revealed.length];
    const idx = list.findIndex((p) => p.id === w);
    setStrip(list);
    setSpinning(true);
    setGo((g) => g + 1);
    haptic('medium');
    sfx('lever');
    lever.set(withSequence(withTiming(1, { duration: 220 }), withSpring(0, { damping: 6 })));

    // The winner sits in the middle row: strip index (REPS - 2) * n + idx.
    const target = ((REPS - 2) * list.length + idx - 1) * ROW;
    y.set(0);
    const total = reduce ? 1500 : 8200;
    if (!reduce) {
      setTimeout(() => {
        setCrawl(true);
        rounds.suspense(true);
      }, 4200);
    }
    y.set(
      withTiming(-target, { duration: total, easing: Easing.bezier(0.2, 0.55, 0.1, 1) }, (f) => {
        if (f) runOnJS(landed)(w);
      }),
    );
  };

  const next = () => {
    const rest = rounds.close();
    if (rest) {
      y.set(0);
      setTimeout(() => pull(rest), 350);
    }
  };

  // While idle, show who's still in play; while spinning/announcing, keep the strip that was spun.
  const shown = spinning || winner ? strip : inPlay;
  const names = Array.from({ length: REPS * shown.length }, (_, i) => shown[i % Math.max(1, shown.length)]).filter(Boolean);
  const won = winner && !spinning;

  return (
    <View style={{ gap: 18, alignItems: 'center', alignSelf: 'stretch' }}>
      <View style={styles.machineRow}>
        <LinearGradient colors={['#F0476E', '#B3173F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.machine}>
          {/* marquee */}
          <View style={styles.marquee}>
            <Text style={{ fontFamily: font.black, fontSize: 18, letterSpacing: 3 }} color="#FFE27A">
              {won ? 'JACKPOT!' : 'BUNUTAN'}
            </Text>
          </View>
          <View style={styles.bulbs}>
            {Array.from({ length: BULBS }, (_, i) => {
              const on = (i + lights) % 2 === 0;
              return <View key={i} style={[styles.bulb, { backgroundColor: on ? '#FFE27A' : 'rgba(255,255,255,0.35)' }]} />;
            })}
          </View>

          {/* reels */}
          <View style={styles.window}>
            <SymbolReel go={go} stopAt={reduce ? 800 : 2200} />
            <View style={styles.nameReel}>
              <Animated.View style={reelStyle}>
                {names.map((p, i) => (
                  <View key={i} style={styles.cell}>
                    <View style={[styles.dot, { backgroundColor: colorOf(p.id) }]} />
                    <Text variant="h3" numberOfLines={1} style={{ maxWidth: 120 }}>
                      {shortName(p.name, 11)}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            </View>
            <SymbolReel go={go} stopAt={reduce ? 1000 : 3600} />
            {/* centre line + fades */}
            <View pointerEvents="none" style={[styles.payline, won && { borderColor: '#F5B53D', borderWidth: 3 }]} />
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']} style={[styles.fade, { top: 0 }]} />
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)']} style={[styles.fade, { bottom: 0 }]} />
          </View>

          <View style={styles.tray}>
            <Text variant="caption" color="rgba(255,255,255,0.85)">
              {spinning ? 'Good luck!' : done ? 'All slots drawn' : `Next: slot #${revealed.length + 1}`}
            </Text>
          </View>
        </LinearGradient>

        {/* lever */}
        <PressableScale onPress={() => pull()} disabled={spinning || !!winner || done} dimWhenDisabled={false} hapticOnPress={false} accessibilityLabel="Pull the lever" style={styles.leverHit}>
          <View style={styles.leverBase} />
          <Animated.View style={[styles.lever, leverStyle]}>
            <View style={styles.leverStick} />
            <View style={styles.leverBall} />
          </Animated.View>
        </PressableScale>
      </View>

      <View style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
        {done && !winner ? (
          <Text variant="h2" tone="brand">
            All slots drawn!
          </Text>
        ) : spinning ? (
          <SuspenseText text={crawl ? 'Almost there… who will it be' : `Rolling for ${slotLabel(revealed.length + 1, order.length)}`} fast={crawl} />
        ) : (
          <Button title={`Pull for slot #${revealed.length + 1}`} icon="zap" variant="brand" full={false} style={{ paddingHorizontal: 28 }} disabled={!!winner} onPress={() => pull()} />
        )}
      </View>

      <PayoutOrderList rounds={rounds} order={order} pending="Pull to reveal" />
      {!spinning && <RoundWinner rounds={rounds} order={order} action="Pull" onNext={next} />}
    </View>
  );
}

const styles = StyleSheet.create({
  machineRow: { flexDirection: 'row', alignItems: 'center' },
  machine: { width: 290, borderRadius: 26, padding: 14, gap: 10, alignItems: 'center' },
  marquee: { backgroundColor: '#3B0A1A', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6 },
  bulbs: { flexDirection: 'row', gap: 10 },
  bulb: { width: 9, height: 9, borderRadius: 5 },
  window: { width: 262, height: ROW * 3, backgroundColor: '#FFFFFF', borderRadius: 16, flexDirection: 'row', overflow: 'hidden', borderWidth: 4, borderColor: '#3B0A1A' },
  sideReel: { width: 52, height: ROW * 3, overflow: 'hidden', borderRightWidth: 1, borderLeftWidth: 1, borderColor: '#EEE' },
  nameReel: { flex: 1, height: ROW * 3, overflow: 'hidden' },
  cell: { height: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  payline: { position: 'absolute', left: 0, right: 0, top: ROW, height: ROW, borderTopWidth: 2, borderBottomWidth: 2, borderColor: 'rgba(229,54,95,0.6)' },
  fade: { position: 'absolute', left: 0, right: 0, height: ROW * 0.8 },
  tray: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 4 },
  leverHit: { width: 44, height: 200, alignItems: 'center', justifyContent: 'center' },
  leverBase: { position: 'absolute', left: 0, top: 110, width: 18, height: 40, borderTopRightRadius: 8, borderBottomRightRadius: 8, backgroundColor: '#8A1230' },
  lever: { position: 'absolute', left: 8, top: 20, width: 30, height: 120, alignItems: 'center', transformOrigin: '50% 100%' },
  leverStick: { width: 8, height: 100, marginTop: 20, backgroundColor: '#9CA3AF', borderRadius: 4 },
  leverBall: { position: 'absolute', top: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5365F', borderWidth: 3, borderColor: '#8A1230' },
});
