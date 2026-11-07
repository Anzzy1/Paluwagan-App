import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { AnimatedMascot, type MascotAction } from '@/components/AnimatedMascot';
import { BandScene, useBandColors } from '@/components/BandScene';
import type { MascotMood, MascotPose } from '@/components/Mascot';
import type { IconName } from '@/components/ui/bits';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

export const MASCOT_NAME = 'Ipon';

/** Green band with Ipon standing on the left and a speech bubble — the app's signature card. */
export function MascotBand({
  mood,
  pose,
  title = MASCOT_NAME,
  tag,
  children,
  actions,
  trigger,
  busy,
  action = 'wave',
  repeatEvery,
}: {
  action?: MascotAction;
  repeatEvery?: number;
  /** Changes when Ipon has something new to say: plays the hop. */
  trigger?: unknown;
  busy?: boolean;
  mood: MascotMood;
  pose: MascotPose;
  title?: string;
  tag?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const band = useBandColors();
  const reduce = useReducedMotion();

  // Tap Ipon: it reacts with the next gesture in the cycle.
  const [poke, setPoke] = useState(0);
  const pokeAction = POKE_ACTIONS[(poke - 1) % POKE_ACTIONS.length];

  // New message: show "typing…" briefly, then reveal the bubble content.
  const [typingFor, setTypingFor] = useState<unknown>(Symbol('none'));
  const [seen, setSeen] = useState<unknown>(Symbol('init'));
  if (trigger !== seen) {
    setSeen(trigger);
    if (!reduce) setTypingFor(trigger);
  }
  const typing = typingFor === trigger && !reduce;
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTypingFor(Symbol('done')), 750);
    return () => clearTimeout(t);
  }, [typing]);

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <LinearGradient colors={band} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band}>
        <BandScene />
        <PressableScale
          onPress={() => {
            haptic('light');
            setPoke((n) => n + 1);
          }}
          hapticOnPress={false}
          scaleTo={0.96}
          accessibilityLabel={`Say hi to ${MASCOT_NAME}`}
          style={styles.mascot}>
          <View style={styles.shadow} />
          <AnimatedMascot
            size={desktop ? 136 : 112}
            mood={poke ? 'excited' : mood}
            pose={pose}
            trigger={poke ? `poke-${poke}` : trigger}
            busy={busy}
            action={poke ? pokeAction : action}
            repeatEvery={repeatEvery}
          />
        </PressableScale>
        <View style={[styles.bubble, { backgroundColor: c.surface }]}>
          <View style={[styles.tail, { backgroundColor: c.surface }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="bodyBold" tone="brand" style={{ fontSize: 14 }}>
              {title}
            </Text>
            {tag && (
              <View style={[styles.tag, { backgroundColor: c.brandSoft }]}>
                <Text variant="caption" tone="brand" style={{ fontSize: 11, lineHeight: 14 }}>
                  {tag}
                </Text>
              </View>
            )}
          </View>
          {typing ? (
            <TypingDots />
          ) : (
            <Animated.View entering={reduce ? undefined : FadeIn.duration(260)} style={{ gap: 5 }}>
              {children}
              {actions && <View style={styles.actions}>{actions}</View>}
            </Animated.View>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const POKE_ACTIONS: MascotAction[] = ['toss', 'cheer', 'wave'];

/** Three bouncing dots, like a chat app's "typing…" indicator. */
function TypingDots() {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 10 }} accessibilityLabel={`${MASCOT_NAME} is typing`}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 140} color={c.textFaint} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(delay, withRepeat(withSequence(withTiming(-4, { duration: 260 }), withTiming(0, { duration: 260 })), -1)));
  }, [y, delay]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, a]} />;
}

/** Small pill button for inside the speech bubble. */
export function BubbleButton({ label, icon, iconRight, onPress, primary, disabled, left }: { label: string; icon?: IconName; iconRight?: IconName; onPress?: () => void; primary?: boolean; disabled?: boolean; left?: ReactNode }) {
  const c = useColors();
  const fg = primary ? c.onBrand : c.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hapticOnPress={false}
      accessibilityLabel={label}
      hitSlop={4}
      style={[styles.btn, { backgroundColor: primary ? c.brand : c.surfaceAlt }]}>
      {left ?? (icon && <Feather name={icon} size={16} color={primary ? c.onBrand : c.brandText} />)}
      <Text variant="smallBold" color={fg} style={{ fontSize: 14 }}>
        {label}
      </Text>
      {iconRight && <Feather name={iconRight} size={16} color={fg} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  band: { borderRadius: radius.xl, flexDirection: 'row', alignItems: 'flex-end', paddingRight: 14, paddingTop: 16, overflow: 'hidden', minHeight: 140 },
  shadow: { position: 'absolute', left: '22%', right: '22%', bottom: 6, height: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.16)' },
  mascot: { marginLeft: 2, marginBottom: -8 },
  bubble: { flex: 1, borderRadius: radius.lg, padding: 16, gap: 6, marginBottom: 16, marginLeft: 4 },
  tail: { position: 'absolute', left: -6, bottom: 22, width: 14, height: 14, transform: [{ rotate: '45deg' }], borderRadius: 3 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  // 44px tall: comfortable tap target on phones.
  btn: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, height: 44, borderRadius: 22 },
});
