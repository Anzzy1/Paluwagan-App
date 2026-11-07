import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { GOLD, GOLD_DARK } from '@/components/Mascot';

type Phase = 'morning' | 'day' | 'evening' | 'night';

function phaseOf(h: number): Phase {
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'evening';
  return 'night';
}

/** Re-evaluates the time of day every few minutes so the scene changes while the app stays open. */
function usePhase() {
  const [phase, setPhase] = useState(() => phaseOf(new Date().getHours()));
  useEffect(() => {
    const t = setInterval(() => setPhase(phaseOf(new Date().getHours())), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return phase;
}

/** Band colours per time of day: always green, a touch deeper in the evening and at night. */
export function useBandColors(): [string, string] {
  const phase = usePhase();
  return {
    morning: ['#2CC46A', '#13904A'],
    day: ['#1DB45A', '#0F7F3A'],
    evening: ['#179E52', '#0B6A33'],
    night: ['#11793F', '#08492A'],
  }[phase] as [string, string];
}

/**
 * Decorative layer behind Ipon: a sun or moon for the time of day, slow-drifting rings,
 * twinkling stars at night and a few coins and sparkles floating up. Purely visual.
 */
export function BandScene() {
  const phase = usePhase();
  const reduce = useReducedMotion();
  const night = phase === 'night' || phase === 'evening';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Drift style={[styles.ring, { right: -50, top: -70 }]} dx={10} dy={8} duration={7000} still={reduce} />
      <Drift style={[styles.ring, { left: 40, bottom: -130, width: 180, height: 180, borderRadius: 90 }]} dx={-8} dy={-6} duration={9000} still={reduce} />

      <View style={styles.sky}>{night ? <Moon /> : <Sun still={reduce} />}</View>

      {night &&
        STARS.map((s, i) => (
          <Twinkle key={i} delay={s.d} still={reduce} style={{ position: 'absolute', left: s.x, top: s.y }}>
            <Star size={s.s} />
          </Twinkle>
        ))}

      {!reduce &&
        FLOATERS.map((f, i) => (
          <Floater key={i} left={f.x} delay={f.d} duration={f.t}>
            {f.kind === 'coin' ? <MiniCoin size={f.s} /> : <Sparkle size={f.s} />}
          </Floater>
        ))}
    </View>
  );
}

// Positions are percentages of the band so they work at phone and laptop widths.
const STARS = [
  { x: '4%', y: 18, s: 4, d: 0 },
  { x: '19%', y: 44, s: 3, d: 700 },
  { x: '27%', y: 12, s: 5, d: 1400 },
  { x: '9%', y: 62, s: 3, d: 400 },
  { x: '33%', y: 36, s: 4, d: 1100 },
] as const;

const FLOATERS = [
  { x: '6%', d: 0, t: 7000, s: 12, kind: 'coin' },
  { x: '24%', d: 2600, t: 8200, s: 9, kind: 'sparkle' },
  { x: '30%', d: 5200, t: 7600, s: 10, kind: 'coin' },
  { x: '14%', d: 4000, t: 9000, s: 8, kind: 'sparkle' },
] as const;

function Drift({ style, dx, dy, duration, still }: { style: object; dx: number; dy: number; duration: number; still: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    t.set(withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, duration, still]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: dx * t.get() }, { translateY: dy * t.get() }] }));
  return <Animated.View style={[style, a]} />;
}

function Twinkle({ children, delay, still, style }: { children: React.ReactNode; delay: number; still: boolean; style: object }) {
  const o = useSharedValue(0.8);
  useEffect(() => {
    if (still) return;
    o.set(withDelay(delay, withRepeat(withSequence(withTiming(0.25, { duration: 1100 }), withTiming(0.9, { duration: 1100 })), -1)));
  }, [o, delay, still]);
  const a = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Rises from the bottom of the band and fades out, then repeats. */
function Floater({ children, left, delay, duration }: { children: React.ReactNode; left: string; delay: number; duration: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1)));
  }, [t, delay, duration]);
  const a = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v < 0.15 ? v / 0.15 : v > 0.7 ? Math.max(0, (1 - v) / 0.3) : 1,
      transform: [{ translateY: -150 * v }, { translateX: Math.sin(v * Math.PI * 2) * 6 }, { rotate: `${v * 40}deg` }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', bottom: 6, left: left as `${number}%` }, a]}>{children}</Animated.View>;
}

function Sun({ still }: { still: boolean }) {
  const r = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    r.set(withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1));
  }, [r, still]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return (
    <Animated.View style={a}>
      <Svg width={46} height={46} viewBox="0 0 46 46">
        {Array.from({ length: 8 }, (_, i) => {
          const ang = (i * Math.PI) / 4;
          const x1 = 23 + Math.cos(ang) * 15;
          const y1 = 23 + Math.sin(ang) * 15;
          const x2 = 23 + Math.cos(ang) * 20;
          const y2 = 23 + Math.sin(ang) * 20;
          return <Path key={i} d={`M${x1} ${y1}L${x2} ${y2}`} stroke="#FFF6D6" strokeOpacity={0.55} strokeWidth={2.2} strokeLinecap="round" />;
        })}
        <Circle cx={23} cy={23} r={10} fill="#FFF6D6" fillOpacity={0.6} />
      </Svg>
    </Animated.View>
  );
}

function Moon() {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34">
      <Path d="M22 4a13 13 0 1 0 8 23A11 11 0 0 1 22 4z" fill="#FFF6D6" fillOpacity={0.7} />
    </Svg>
  );
}

function Star({ size }: { size: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF' }} />;
}

function Sparkle({ size }: { size: number }) {
  return (
    <Svg width={size * 2} height={size * 2} viewBox="0 0 20 20">
      <Path d="M10 1c.6 4.6 2.9 7.4 9 9-6.1 1.6-8.4 4.4-9 9-.6-4.6-2.9-7.4-9-9 6.1-1.6 8.4-4.4 9-9z" fill="#FFFFFF" fillOpacity={0.75} />
    </Svg>
  );
}

function MiniCoin({ size }: { size: number }) {
  return (
    <View style={{ width: size * 1.6, height: size * 1.6, borderRadius: size, backgroundColor: GOLD, borderWidth: 1.5, borderColor: GOLD_DARK, opacity: 0.9 }} />
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' },
  // Top-left, above Ipon: the speech bubble covers the right side.
  sky: { position: 'absolute', left: 16, top: 12, opacity: 0.9 },
});
