import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';

import { AnimatedMascot, type MascotAction } from '@/components/AnimatedMascot';
import { BandScene, useBandColors } from '@/components/BandScene';
import { Text } from '@/components/ui/Text';
import { font } from '@/theme/tokens';

export const WELCOME_LINES = [
  'Hi, I’m Ipon! I’ll keep your paluwagan fair and everyone on time.',
  'Pick the payout order with a fun bunutan that every member can verify.',
  'Track every hulog and sahod, online with your group or offline on your phone.',
];
const ACTIONS: MascotAction[] = ['wave', 'toss', 'cheer'];

/** Gently bobs its children up and down, forever. */
function Bob({ children, delay = 0, amount = 7, style }: { children: ReactNode; delay?: number; amount?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [t, delay, reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -amount * t.get() }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** A tilted white "sticker" card floating over the green scene. */
function Sticker({ icon, tint, title, value, tilt, delay }: { icon: keyof typeof Feather.glyphMap; tint: string; title: string; value: string; tilt: number; delay: number }) {
  return (
    <Animated.View entering={ZoomIn.delay(delay).springify().damping(12)} style={{ transform: [{ rotate: `${tilt}deg` }] }}>
      <View style={styles.sticker}>
        <View style={[styles.stickerIcon, { backgroundColor: tint }]}>
          <Feather name={icon} size={14} color="#fff" />
        </View>
        <View>
          <Text variant="caption" color="#6B7570" style={{ fontSize: 10, lineHeight: 13 }}>
            {title}
          </Text>
          <Text color="#0C1410" style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18 }}>
            {value}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The green welcome scene: Ipon in the middle with a speech bubble that cycles through
 * `lines`, floating sticker cards, drifting coins and the time-of-day sky.
 */
/** Bouncy "paluwagan" wordmark: letters pop in one by one, then gently wave. */
function Wordmark({ size }: { size: number }) {
  return (
    <View style={styles.wordmark} accessibilityRole="header" accessibilityLabel="paluwagan">
      {'paluwagan'.split('').map((ch, k) => (
        <Animated.View key={k} entering={ZoomIn.delay(120 + k * 60).springify().damping(9)}>
          <Bob delay={k * 160} amount={4}>
            <Text
              style={{
                fontFamily: font.cuteBold,
                fontSize: size,
                lineHeight: size * 1.15,
                color: '#FFFFFF',
                transform: [{ rotate: `${k % 2 ? 4 : -4}deg` }],
                textShadowColor: 'rgba(0,0,0,0.18)',
                textShadowOffset: { width: 0, height: 3 },
                textShadowRadius: 0,
              }}>
              {ch}
            </Text>
          </Bob>
        </Animated.View>
      ))}
    </View>
  );
}

export function WelcomeScene({
  lines = WELCOME_LINES,
  compact = false,
  wordmark = true,
  topInset = 0,
  style,
}: {
  lines?: string[];
  compact?: boolean;
  /** Show the bouncy "paluwagan" title at the top when there's room. */
  wordmark?: boolean;
  /** Safe-area top padding (the wordmark sits below it). */
  topInset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const grad = useBandColors();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 4200);
    return () => clearInterval(t);
  }, [lines.length]);
  const line = lines[i % lines.length];
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  // Big = a roomy desktop panel: centre everything and make Ipon larger.
  const big = w >= 560;
  const mascot = big ? 230 : compact ? 120 : 160;
  const stage = big ? 440 : Math.min(330, Math.max(260, w - 60));
  // Only show the wordmark when it fits above the bubble.
  const markSize = big ? 60 : 40;
  const stageH = big ? mascot + 150 : mascot + 130;
  const free = big ? (h - stageH) / 2 : h - topInset - stageH;
  const showMark = wordmark && h > 0 && free >= markSize * 1.15 + (big ? 60 : 20);

  return (
    <LinearGradient
      colors={grad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setH(e.nativeEvent.layout.height);
      }}
      style={[styles.scene, big && { justifyContent: 'center' }, { paddingTop: topInset }, style]}>
      <BandScene />
      {showMark && (
        <View style={[styles.markWrap, { top: topInset + (big ? 48 : 12) }]} pointerEvents="none">
          <Wordmark size={markSize} />
        </View>
      )}

      {/* Ipon + speech bubble, with stickers floating around him */}
      <View style={[styles.stage, { width: stage, paddingBottom: big ? 0 : 34 }]}>
        <Animated.View key={line} entering={FadeIn.duration(350)} style={[styles.bubble, { maxWidth: big ? 340 : 290 }]}>
          <Text variant="smallBold" color="#16A34A">
            Ipon
          </Text>
          <Text variant={big ? 'body' : 'small'} color="#0C1410" style={{ lineHeight: big ? 22 : 19 }}>
            {line}
          </Text>
          <View style={styles.tail} />
        </Animated.View>
        <View>
          <Bob delay={0} style={[styles.abs, { left: -stage * (big ? 0.36 : 0.3), bottom: mascot * 0.58 }]}>
            <Sticker icon="gift" tint="#F5B53D" title="Your sahod" value="₱12,000" tilt={-8} delay={250} />
          </Bob>
          <Bob delay={900} style={[styles.abs, { right: -stage * (big ? 0.36 : 0.32), bottom: mascot * 0.7 }]}>
            <Sticker icon="check" tint="#16A34A" title="Hulog today" value="Maria paid" tilt={7} delay={450} />
          </Bob>
          {!compact && (
            <Bob delay={1700} style={[styles.abs, { right: -stage * 0.32, bottom: mascot * 0.04 }]}>
              <Sticker icon="shuffle" tint="#7350E8" title="Bunutan" value="You’re #3" tilt={-5} delay={650} />
            </Bob>
          )}
          <Animated.View entering={FadeInDown.delay(100).springify().damping(13)}>
            <AnimatedMascot size={mascot} mood="excited" pose={i % 2 ? 'coin' : 'cheer'} action={ACTIONS[i % ACTIONS.length]} trigger={i} />
          </Animated.View>
        </View>
        <View style={[styles.shadow, { width: mascot * 0.55 }]} />
      </View>

      {lines.length > 1 && (
        <View style={styles.dots}>
          {lines.map((_, k) => (
            <View key={k} style={[styles.dot, k === i % lines.length && styles.dotOn]} />
          ))}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scene: { overflow: 'hidden', justifyContent: 'flex-end' },
  abs: { position: 'absolute', zIndex: 2, alignItems: 'center' },
  sticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 16,
    shadowColor: '#06331A',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  stickerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stage: { alignItems: 'center', alignSelf: 'center', zIndex: 1 },
  markWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 3 },
  wordmark: { flexDirection: 'row', alignItems: 'flex-end' },
  bubble: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, gap: 2, marginBottom: 14, marginHorizontal: 20 },
  tail: { position: 'absolute', bottom: -7, left: '50%', marginLeft: -8, width: 16, height: 16, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderRadius: 3 },
  shadow: { height: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.16)', marginTop: -10 },
  dots: { position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', gap: 6, zIndex: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { width: 18, backgroundColor: '#FFFFFF' },
});
