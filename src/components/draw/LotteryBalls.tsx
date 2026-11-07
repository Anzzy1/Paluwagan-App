import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { BounceIn, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
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
  const spin = useSharedValue(0);
  const drum = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!running) return;
    spin.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false));
    let k = 0;
    const t = setInterval(() => {
      k++;
      haptic('medium');
      setCount(k);
      if (k >= order.length) {
        clearInterval(t);
        spin.set(0);
        setRunning(false);
        haptic('success');
        setTimeout(() => doneRef.current(), 500);
      }
    }, order.length > 12 ? 600 : 1000);
    return () => clearInterval(t);
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
        <Text variant="h3" tone="muted">
          {running ? 'Rolling…' : 'All balls drawn!'}
        </Text>
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
