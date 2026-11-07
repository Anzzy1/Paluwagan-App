import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AnimatedMascot, type MascotAction } from '@/components/AnimatedMascot';
import type { MascotMood, MascotPose } from '@/components/Mascot';
import type { IconName } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
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
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <LinearGradient colors={['#1DB45A', '#0F7F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band}>
        <View style={[styles.deco, { right: -40, top: -60 }]} />
        <View style={[styles.deco, { left: 50, bottom: -120, width: 170, height: 170 }]} />
        <View style={styles.mascot}>
          <AnimatedMascot size={desktop ? 136 : 112} mood={mood} pose={pose} trigger={trigger} busy={busy} action={action} repeatEvery={repeatEvery} />
        </View>
        <View style={[styles.bubble, { backgroundColor: c.surface }]}>
          <View style={[styles.tail, { backgroundColor: c.surface }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="smallBold" tone="brand">
              {title}
            </Text>
            {tag && (
              <View style={[styles.tag, { backgroundColor: c.brandSoft }]}>
                <Text variant="caption" tone="brand" style={{ fontSize: 10, lineHeight: 13 }}>
                  {tag}
                </Text>
              </View>
            )}
          </View>
          {children}
          {actions && <View style={styles.actions}>{actions}</View>}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

/** Small pill button for inside the speech bubble. */
export function BubbleButton({ label, icon, iconRight, onPress, primary, disabled, left }: { label: string; icon?: IconName; iconRight?: IconName; onPress?: () => void; primary?: boolean; disabled?: boolean; left?: ReactNode }) {
  const c = useColors();
  const fg = primary ? c.onBrand : c.text;
  return (
    <PressableScale onPress={onPress} disabled={disabled} hapticOnPress={false} style={[styles.btn, { backgroundColor: primary ? c.brand : c.surfaceAlt }]}>
      {left ?? (icon && <Feather name={icon} size={13} color={primary ? c.onBrand : c.brand} />)}
      <Text variant="caption" color={fg} style={{ fontSize: 12.5 }}>
        {label}
      </Text>
      {iconRight && <Feather name={iconRight} size={13} color={fg} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  band: { borderRadius: radius.xl, flexDirection: 'row', alignItems: 'flex-end', paddingRight: 14, paddingTop: 16, overflow: 'hidden', minHeight: 140 },
  deco: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.09)' },
  mascot: { marginLeft: 2, marginBottom: -8 },
  bubble: { flex: 1, borderRadius: radius.lg, padding: 14, gap: 5, marginBottom: 16, marginLeft: 4 },
  tail: { position: 'absolute', left: -6, bottom: 22, width: 14, height: 14, transform: [{ rotate: '45deg' }], borderRadius: 3 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 30, borderRadius: 15 },
});
