import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { NavIcon, type NavIconName } from '@/components/NavIcons';
import type { IconName } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDark } from '@/lib/prefs';
import { radius, tileGradients } from '@/theme/tokens';

/** Soft mint-to-sky gradient card with a green overline — the app's "featured" surface. */
export function FeatureCard({
  overline,
  overlineIcon = 'star',
  right,
  children,
  style,
}: {
  overline?: string;
  overlineIcon?: IconName;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <LinearGradient colors={[c.featureA, c.featureB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, style]}>
      {(overline || right) && (
        <View style={styles.head}>
          {overline ? (
            <View style={styles.overline}>
              <Feather name={overlineIcon} size={13} color={c.brand} />
              <Text variant="overline" tone="brand">
                {overline}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {right}
        </View>
      )}
      {children}
    </LinearGradient>
  );
}

/** Rounded-square icon tile: vivid gradient, glossy top light, coloured glow and a bold duotone glyph. */
export function IconTile({ icon, tone = 'green', size = 48 }: { icon: NavIconName; tone?: keyof typeof tileGradients; size?: number }) {
  const dark = useIsDark();
  const t = tileGradients[tone];
  const r = Math.round(size * 0.34);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        shadowColor: t.glow,
        shadowOpacity: dark ? 0.5 : 0.38,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 6,
      }}>
      <LinearGradient colors={t.grad as unknown as [string, string]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }]}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <NavIcon name={icon} size={Math.round(size * 0.52)} color="#FFFFFF" active weight={2.3} />
      </View>
    </View>
  );
}

/** Small white pill used inside featured cards for dates and counts. */
export function Pill({ icon, label }: { icon?: IconName; label: string }) {
  const c = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: c.surface }]}>
      {icon && <Feather name={icon} size={12} color={c.brand} />}
      <Text variant="overline" tone="brand" style={{ letterSpacing: 0.6 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 20, gap: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  overline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
});
