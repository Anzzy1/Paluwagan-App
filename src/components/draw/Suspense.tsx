import { useEffect, useState } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';

/** Ordinal label for a payout slot, emphasising the first and last ones. */
export function slotLabel(slot: number, total: number) {
  if (slot === 1) return 'the FIRST payout';
  if (slot === total) return 'the LAST payout';
  const suffix = slot % 10 === 1 && slot % 100 !== 11 ? 'st' : slot % 10 === 2 && slot % 100 !== 12 ? 'nd' : slot % 10 === 3 && slot % 100 !== 13 ? 'rd' : 'th';
  return `the ${slot}${suffix} payout`;
}

/**
 * A heartbeat-pulsing line with animated dots ("Who will it be..."), used while a draw builds
 * up tension. `fast` makes the heartbeat quicker for the final moments.
 */
export function SuspenseText({ text, fast = false, tone = 'brand' }: { text: string; fast?: boolean; tone?: 'brand' | 'muted' }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const beat = useSharedValue(1);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (reduce) return;
    const d = fast ? 260 : 420;
    beat.set(withRepeat(withSequence(withTiming(1.07, { duration: d * 0.35 }), withTiming(1, { duration: d * 0.65 })), -1));
    const t = setInterval(() => setDots((x) => (x % 3) + 1), fast ? 250 : 400);
    return () => clearInterval(t);
  }, [fast, reduce, beat]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: beat.get() }] }));
  return (
    <Animated.View style={style}>
      <Text variant="h3" center color={tone === 'brand' ? c.brandText : c.textMuted}>
        {text}
        {'.'.repeat(dots)}
      </Text>
    </Animated.View>
  );
}
