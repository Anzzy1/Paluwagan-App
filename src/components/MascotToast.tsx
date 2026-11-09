import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedMascot } from '@/components/AnimatedMascot';
import { MASCOT_NAME } from '@/components/MascotBand';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { dismissReaction, useReaction, type Reaction } from '@/lib/reactions';
import { useColors, useIsDark, useIsDesktop, usePrefs } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

const SHOW_MS = 5200;

function Toast({ r }: { r: Reaction }) {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const y = useSharedValue(-220);
  const timer = useSharedValue(1);

  const close = useCallback(() => {
    y.set(withTiming(-220, { duration: 220 }));
    setTimeout(() => dismissReaction(r.id), 230);
  }, [r.id, y]);

  useEffect(() => {
    haptic('success');
    y.set(-220);
    y.set(withSpring(0, { damping: 22, stiffness: 180 }));
    timer.set(1);
    timer.set(withTiming(0, { duration: SHOW_MS, easing: Easing.linear }));
    const t = setTimeout(close, SHOW_MS);
    return () => clearTimeout(t);
  }, [close, y, timer]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const bar = useAnimatedStyle(() => ({ width: `${timer.get() * 100}%` }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + (desktop ? 20 : 10) }, slide]}>
      <PressableScale onPress={close} hapticOnPress={false} scaleTo={0.98} accessibilityRole="alert" accessibilityLabel={`${r.title}. ${r.text}`}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: dark ? c.border : 'transparent', shadowColor: c.shadow }]}>
          <View style={[styles.mascot, { backgroundColor: c.brandSoft }]}>
            <AnimatedMascot size={62} mood={r.mood} pose={r.pose} action={r.action} trigger={r.id} idle />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="caption" tone="brand">
                {MASCOT_NAME}
              </Text>
              <View style={[styles.dot, { backgroundColor: c.borderStrong }]} />
              <Text variant="caption" tone="faint">
                just now
              </Text>
            </View>
            <Text variant="bodyBold">{r.title}</Text>
            <Text variant="small" tone="muted" style={{ lineHeight: 18 }}>
              {r.text}
            </Text>
          </View>
          <Feather name="x" size={16} color={c.textFaint} style={{ alignSelf: 'flex-start' }} />
          <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
            <Animated.View style={[styles.bar, { backgroundColor: c.brand }, bar]} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/** Mount once near the root: shows Ipon's reaction cards as they come in. */
export function MascotToastHost() {
  const r = useReaction();
  const { toggles } = usePrefs();
  if (!r || !toggles.mascotTips) return null;
  return <Toast key={r.id} r={r} />;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000, elevation: 20 },
  card: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingRight: 14,
    paddingBottom: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  mascot: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dot: { width: 3, height: 3, borderRadius: 2 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  bar: { height: 3 },
});
