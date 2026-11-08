import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedMascot, type MascotAction } from '@/components/AnimatedMascot';
import { BandScene, useBandColors } from '@/components/BandScene';
import { Avatar } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Confetti } from '@/components/ui/Confetti';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { font } from '@/theme/tokens';

const ACTIONS: MascotAction[] = ['wave', 'toss', 'cheer'];

/**
 * The "you're in" moment after setup: Ipon waves hello and types out a short welcome,
 * the new member card pops in with confetti, then "Let's go" opens the app.
 */
export function WelcomeMoment({
  name,
  seed,
  photo,
  onDone,
  loading,
}: {
  name: string;
  seed?: string;
  photo?: string | null;
  onDone: () => void;
  loading?: boolean;
}) {
  const grad = useBandColors();
  const insets = useSafeAreaInsets();
  const first = name.trim().split(/\s+/)[0] || 'there';
  const lines = [`Hi, ${first}! Welcome to Paluwagan.`, 'I’m Ipon, your ipon buddy. I’ll remind you when hulog is due.', 'Your paluwagan is all set. Let’s start saving together!'];

  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);
  const typed = chars >= lines[line].length;
  const finished = line === lines.length - 1 && typed;

  // Typewriter: reveal one line letter by letter, pause, then the next.
  useEffect(() => {
    const t = typed
      ? line < lines.length - 1
        ? setTimeout(() => {
            setLine((l) => l + 1);
            setChars(0);
          }, 1100)
        : null
      : setTimeout(() => setChars((n) => n + 1), 24);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [typed, line, chars, lines.length]);

  useEffect(() => {
    if (finished) haptic('success');
  }, [finished]);

  return (
    <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <BandScene />
      <Confetti run={finished ? 1 : 0} />

      <View style={styles.center}>
        {/* Speech bubble with the typed line */}
        <Animated.View entering={FadeInDown.delay(300).springify().damping(14)} style={styles.bubble}>
          <Text variant="smallBold" color="#16A34A">
            Ipon
          </Text>
          <Text color="#0C1410" style={{ fontSize: 17, lineHeight: 24, minHeight: 48 }}>
            {lines[line].slice(0, chars)}
            {!typed && <Text color="#16A34A">▍</Text>}
          </Text>
          <View style={styles.tail} />
        </Animated.View>

        <Animated.View entering={ZoomIn.springify().damping(10)}>
          <AnimatedMascot size={190} mood="excited" pose={line === 2 ? 'cheer' : 'coin'} action={ACTIONS[line]} trigger={line} />
        </Animated.View>
        <View style={styles.shadow} />

        {/* New member card */}
        {line >= 1 && (
          <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.card}>
            <Avatar name={name} seed={seed} uri={photo} size={48} ring="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="#6B7570">
                New member
              </Text>
              <Text color="#0C1410" numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 17 }}>
                {name.trim()}
              </Text>
            </View>
            <View style={styles.pill}>
              <Text variant="caption" color="#FFFFFF" style={{ fontFamily: font.bold }}>
                Ka-paluwagan
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {lines.map((_, k) => (
            <View key={k} style={[styles.dot, k <= line && styles.dotOn]} />
          ))}
        </View>
        {finished ? (
          <Animated.View entering={FadeInUp.springify().damping(14)} style={{ width: '100%' }}>
            <Button title="Let’s go!" iconRight="arrow-right" variant="secondary" onPress={onDone} loading={loading} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.delay(1200)}>
            <Text
              variant="smallBold"
              color="rgba(255,255,255,0.85)"
              onPress={() => {
                setLine(lines.length - 1);
                setChars(lines[lines.length - 1].length);
              }}
              style={{ paddingVertical: 14 }}>
              Skip
            </Text>
          </Animated.View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', maxWidth: 420, alignSelf: 'center' },
  bubble: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, gap: 2, marginBottom: 18, alignSelf: 'stretch' },
  tail: { position: 'absolute', bottom: -7, left: '50%', marginLeft: -8, width: 16, height: 16, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderRadius: 3 },
  shadow: { width: 110, height: 14, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.16)', marginTop: -12 },
  card: {
    marginTop: 26,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#06331A',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pill: { backgroundColor: '#16A34A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  footer: { alignItems: 'center', gap: 14, width: '100%', maxWidth: 420, alignSelf: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { width: 18, backgroundColor: '#FFFFFF' },
});
