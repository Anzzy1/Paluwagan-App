import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { settings } from '@/lib/prefs';
import { circleTints } from '@/theme/tokens';

const COLORS = Object.values(circleTints).map((t) => t.strong);
const { width: W, height: H } = Dimensions.get('window');

/** Pure, seeded pseudo-random in [0, 1). */
function rand(i: number, run: number, k: number) {
  const x = Math.sin(i * 12.9898 + (run % 10000) * 78.233 + k * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function Piece({ i, run }: { i: number; run: number }) {
  const cfg = {
    x: rand(i, run, 1) * W,
    drift: (rand(i, run, 2) - 0.5) * 160,
    size: 6 + rand(i, run, 3) * 8,
    delay: rand(i, run, 4) * 300,
    duration: 1800 + rand(i, run, 5) * 1200,
    spin: (rand(i, run, 6) - 0.5) * 1080,
    color: COLORS[i % COLORS.length],
    round: rand(i, run, 7) > 0.6,
  };
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(cfg.delay, withTiming(1, { duration: cfg.duration, easing: Easing.out(Easing.quad) })));
  }, [cfg.delay, cfg.duration, t]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v === 0 ? 0 : 1 - Math.max(0, v - 0.8) * 5,
      transform: [
        { translateX: cfg.x + cfg.drift * v },
        { translateY: -40 + (H + 80) * v },
        { rotate: `${cfg.spin * v}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: cfg.size, height: cfg.round ? cfg.size : cfg.size * 1.6, backgroundColor: cfg.color, borderRadius: cfg.round ? cfg.size : 2 },
        style,
      ]}
    />
  );
}

/** Fire by changing `run` to a new non-zero number. */
export function Confetti({ run, count = 60 }: { run: number; count?: number }) {
  if (!run || !settings.celebrations) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <Piece key={`${run}-${i}`} i={i} run={run} />
      ))}
    </View>
  );
}
