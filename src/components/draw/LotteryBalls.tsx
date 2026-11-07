import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { BounceIn, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

/** Lottery Balls: the drum spins and numbered balls drop out in the fair order. */
export function LotteryBalls({ participants, order, onDone }: DrawGameProps) {
  const c = useColors();
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [drawing, setDrawing] = useState<number | null>(null); // slot whose ball is about to drop
  const spin = useSharedValue(0);
  const drum = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!running) return;
    // Each ball: the drum churns faster and faster (suspense), then the ball pops out.
    // The first and last slots get a longer build-up.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const total = order.length;
    const churnFor = (slot: number) => (slot === 1 || slot === total ? 3000 : total > 12 ? 1400 : 2200);
    let at = 0;
    for (let k = 1; k <= total; k++) {
      const churn = churnFor(k);
      timers.push(
        setTimeout(() => {
          setDrawing(k);
          haptic('light');
          spin.set(0);
          spin.set(withRepeat(withTiming(360, { duration: 380, easing: Easing.linear }), -1, false));
        }, at),
      );
      at += churn;
      timers.push(
        setTimeout(() => {
          haptic('medium');
          setCount(k);
          spin.set(withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false));
        }, at),
      );
      at += 900;
    }
    timers.push(
      setTimeout(() => {
        spin.set(0);
        setDrawing(null);
        setRunning(false);
        haptic('success');
        setTimeout(() => doneRef.current(), 600);
      }, at),
    );
    return () => timers.forEach(clearTimeout);
  }, [running, order.length, spin]);

  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <Animated.View style={[styles.drum, { borderColor: c.ink, backgroundColor: c.surfaceAlt }, drum]}>
        {participants.slice(0, 12).map((p, i, arr) => (
          <View
            key={p.id}
            style={[
              styles.mini,
              { backgroundColor: colorAt(i), left: 65 + Math.cos((i / arr.length) * Math.PI * 2) * 46, top: 65 + Math.sin((i / arr.length) * Math.PI * 2) * 46 },
            ]}
          />
        ))}
      </Animated.View>
      {count === 0 && !running ? (
        <Button title="Roll the drum!" icon="play" variant="brand" full={false} style={{ paddingHorizontal: 28, alignSelf: 'center' }} onPress={() => setRunning(true)} />
      ) : (
        running && drawing !== null && count < drawing ? (
          <SuspenseText text={`Drawing ${slotLabel(drawing, order.length)}`} fast={drawing === 1 || drawing === order.length} />
        ) : (
          <Text variant="h3" tone="muted">
            {running ? 'Next ball coming up…' : 'All balls drawn!'}
          </Text>
        )
      )}
      <View style={styles.tray}>
        {order.slice(0, count).map((id, i) => {
          const idx = participants.findIndex((p) => p.id === id);
          const p = participants[idx];
          return (
            <Animated.View key={id} entering={BounceIn.duration(600)} style={styles.ballWrap}>
              <View style={[styles.ball, { backgroundColor: colorAt(idx) }]}>
                <View style={styles.ballFace}>
                  <Text variant="h2" color={colorAt(idx)}>
                    {i + 1}
                  </Text>
                </View>
              </View>
              <Text variant="caption" numberOfLines={1} center>
                {shortName(p?.name ?? '', 10)}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  drum: { width: 160, height: 160, borderRadius: 80, borderWidth: 5 },
  mini: { position: 'absolute', width: 20, height: 20, borderRadius: 10 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  ballWrap: { width: 72, alignItems: 'center', gap: 4 },
  ball: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  ballFace: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: radius.pill },
});
