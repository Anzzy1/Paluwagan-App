import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, Polygon, Stop, LinearGradient as SvgGradient } from 'react-native-svg';

import { Chip, ProgressBar, type IconName } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import type { Badge } from '@/lib/rewards';
import { radius } from '@/theme/tokens';

// ---------- colour helpers

function mix(hex: string, to: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const lighten = (hex: string, t: number) => mix(hex, '#FFFFFF', t);
const darken = (hex: string, t: number) => mix(hex, '#000000', t);

// ---------- streak

export const STREAK_MILESTONES = [3, 5, 10, 20, 30, 50, 100];

export function nextMilestone(streak: number) {
  const next = STREAK_MILESTONES.find((m) => m > streak) ?? Math.ceil((streak + 1) / 50) * 50;
  return { next, progress: streak / next };
}

/** A two-tone flame. `lit` false draws it grey (no streak yet). */
export function Flame({ size = 64, lit = true }: { size?: number; lit?: boolean }) {
  const id = lit ? 'flameLit' : 'flameOff';
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lit ? '#FFD23F' : '#D5D9D6'} />
          <Stop offset="0.55" stopColor={lit ? '#FF8A1F' : '#B9BFBB'} />
          <Stop offset="1" stopColor={lit ? '#F2452D' : '#9AA19C'} />
        </SvgGradient>
      </Defs>
      <Path
        d="M50 4 C 62 26, 90 42, 90 76 C 90 101, 71 117, 50 117 C 29 117, 10 101, 10 76 C 10 57, 21 45, 30 36 C 30 50, 36 58, 44 60 C 39 40, 41 20, 50 4 Z"
        fill={`url(#${id})`}
      />
      <Path
        d="M50 50 C 59 64, 73 73, 73 91 C 73 105, 63 113, 50 113 C 37 113, 27 105, 27 91 C 27 79, 35 71, 41 65 C 43 75, 47 77, 52 77 C 48 67, 46 59, 50 50 Z"
        fill={lit ? '#FFE9A0' : '#EEF0EE'}
      />
      <Ellipse cx="38" cy="58" rx="6" ry="12" fill="#FFFFFF" opacity={0.35} transform="rotate(-20 38 58)" />
    </Svg>
  );
}

/** Flame that gently flickers while the streak is alive. */
function LiveFlame({ size, lit }: { size: number; lit: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!lit) return;
    t.set(withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })), -1));
  }, [lit, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 + t.get() * 0.06 }, { scaleX: 1 - t.get() * 0.03 }, { rotate: `${(t.get() - 0.5) * 4}deg` }],
  }));
  return (
    <Animated.View style={[{ transformOrigin: 'bottom' }, style]}>
      <Flame size={size} lit={lit} />
    </Animated.View>
  );
}

function Sparkle({ size, style }: { size: number; style: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ position: 'absolute' }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Path d="M10 0 L12.4 7.6 L20 10 L12.4 12.4 L10 20 L7.6 12.4 L0 10 L7.6 7.6 Z" fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

/** Big, fun streak card: flickering flame, the count, and progress to the next milestone. */
export function StreakCard({ streak, unit = 'on-time payments in a row', style }: { streak: number; unit?: string; style?: StyleProp<ViewStyle> }) {
  const lit = streak > 0;
  const { next, progress } = nextMilestone(streak);
  const left = next - streak;
  return (
    <LinearGradient
      colors={lit ? ['#FF9A3C', '#F2542D'] : ['#8E9792', '#6B7570']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.streak, style]}>
      {/* soft decorative flames + sparkles */}
      <View style={styles.ghost} pointerEvents="none">
        <Flame size={150} lit={false} />
      </View>
      {lit && (
        <>
          <Sparkle size={14} style={{ top: 14, right: 22, opacity: 0.9 }} />
          <Sparkle size={9} style={{ top: 40, right: 52, opacity: 0.7 }} />
          <Sparkle size={11} style={{ bottom: 22, right: 18, opacity: 0.6 }} />
        </>
      )}

      <View style={styles.flameWrap}>
        <LiveFlame size={70} lit={lit} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="hero" color="#FFFFFF" style={{ fontSize: 46, lineHeight: 50 }}>
            {streak}
          </Text>
          <Text variant="h3" color="#FFFFFF">
            streak
          </Text>
        </View>
        <Text variant="small" color="#FFFFFF" style={{ opacity: 0.92 }}>
          {lit ? unit : 'Pay your next hulog on time to light the flame.'}
        </Text>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(4, Math.round(progress * 100))}%` }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" color="#FFFFFF" style={{ opacity: 0.92 }}>
            {left} more to {next}
          </Text>
          <View style={styles.goal}>
            <Feather name="award" size={11} color="#F2542D" />
            <Text variant="caption" color="#F2542D">
              {next}
            </Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

/** Compact streak pill for tight spaces (sidebar). */
export function StreakPill({ streak, caption }: { streak: number; caption?: string }) {
  const lit = streak > 0;
  return (
    <LinearGradient colors={lit ? ['#FF9A3C', '#F2542D'] : ['#8E9792', '#6B7570']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
      <LiveFlame size={26} lit={lit} />
      <View style={{ flex: 1 }}>
        <Text variant="smallBold" color="#FFFFFF">
          {lit ? `${streak} on-time streak` : 'No streak yet'}
        </Text>
        {caption ? (
          <Text variant="caption" color="#FFFFFF" style={{ opacity: 0.85 }} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  );
}

// ---------- badges

const SCALLOP = (() => {
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? 42 : 37;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(48 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

/** A medal with ribbons, scalloped rim, shine and the badge icon. Locked medals are grey. */
export function Medal({ icon, color, earned, size = 64 }: { icon: IconName; color: string; earned: boolean; size?: number }) {
  const c = useColors();
  const base = earned ? color : '#B7BDB9';
  const id = `m${base.slice(1)}`;
  const h = size * 1.2;
  return (
    <View style={{ width: size, height: h, opacity: earned ? 1 : 0.75 }}>
      <Svg width={size} height={h} viewBox="0 0 100 120">
        <Defs>
          <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={lighten(base, 0.35)} />
            <Stop offset="1" stopColor={darken(base, 0.12)} />
          </SvgGradient>
        </Defs>
        {/* ribbons */}
        <Path d="M32 70 L20 116 L33 108 L41 119 L50 80 Z" fill={earned ? darken(base, 0.25) : '#9AA19C'} />
        <Path d="M68 70 L80 116 L67 108 L59 119 L50 80 Z" fill={earned ? lighten(base, 0.1) : '#A9AFAB'} />
        {/* rim */}
        <Polygon points={SCALLOP} fill={earned ? '#F5B53D' : '#C9CECB'} stroke={earned ? '#F5B53D' : '#C9CECB'} strokeWidth={4} strokeLinejoin="round" />
        <Circle cx="50" cy="48" r="33" fill={earned ? '#FFE08A' : '#DDE1DE'} />
        <Circle cx="50" cy="48" r="28" fill={`url(#${id})`} />
        <Circle cx="50" cy="48" r="28" fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={2} />
        {/* shine */}
        <Path d="M30 40 A 22 22 0 0 1 52 22" fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={4} strokeLinecap="round" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: size * 0.4 - size * 0.14 }]} pointerEvents="none">
        <Feather name={earned ? icon : 'lock'} size={size * 0.28} color={earned ? '#FFFFFF' : c.textFaint} />
      </View>
    </View>
  );
}

/** Grid of medals (medal + name only, so every cell lines up). Tap one for its details. */
export function BadgeGrid({ badges }: { badges: Badge[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Keep the last badge while the sheet animates closed.
  const [shown, setShown] = useState<Badge | null>(null);
  const current = badges.find((b) => b.id === openId) ?? null;
  if (current && current !== shown) setShown(current);
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
        {badges.map((b) => (
          <PressableScale
            key={b.id}
            onPress={() => setOpenId(b.id)}
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityLabel={`${b.title}, ${b.earned ? 'unlocked' : 'locked'}`}
            style={{ width: '25%', alignItems: 'center', gap: 4, paddingHorizontal: 3 }}>
            <Medal icon={b.icon} color={b.color} earned={b.earned} />
            <Text variant="caption" center numberOfLines={2} tone={b.earned ? 'default' : 'muted'}>
              {b.title}
            </Text>
          </PressableScale>
        ))}
      </View>
      <Sheet open={!!current} onClose={() => setOpenId(null)}>
        {shown && <BadgeInfo badge={shown} />}
      </Sheet>
    </>
  );
}

function BadgeInfo({ badge: b }: { badge: Badge }) {
  const c = useColors();
  const showProgress = !b.earned && b.goal > 0;
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingBottom: 8 }}>
      <Medal icon={b.icon} color={b.color} earned={b.earned} size={104} />
      <Text variant="h2" center>
        {b.title}
      </Text>
      <Chip label={b.earned ? 'Unlocked' : 'Locked'} tone={b.earned ? 'brand' : 'neutral'} icon={b.earned ? 'check' : 'lock'} style={{ alignSelf: 'center' }} />
      <Text variant="body" tone="muted" center style={{ maxWidth: 320 }}>
        {b.earned ? `You earned this: ${lowerFirst(b.body)}.` : `How to unlock: ${lowerFirst(b.body)}.`}
      </Text>
      {showProgress && (
        <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="smallBold" tone="muted">
              Your progress
            </Text>
            <Text variant="smallBold">
              {Math.min(b.count, b.goal)} of {b.goal}
            </Text>
          </View>
          <ProgressBar progress={Math.min(1, b.count / b.goal)} color={b.color} height={10} track={c.border} />
        </View>
      )}
    </View>
  );
}

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

const styles = StyleSheet.create({
  streak: { borderRadius: radius.lg, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  ghost: { position: 'absolute', right: -30, bottom: -50, opacity: 0.18 },
  flameWrap: { width: 84, height: 96, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 10, marginBottom: 4, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
});
