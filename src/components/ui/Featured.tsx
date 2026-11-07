import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { NavIcon, type NavIconName } from '@/components/NavIcons';
import type { IconName } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

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

/**
 * Rounded-square icon tile in the brand green. `solid` is the primary action (green fill, white glyph);
 * `soft` is a secondary action (mint fill, green glyph), mirroring the primary/secondary button pair.
 */
export function IconTile({ icon, tone = 'soft', size = 48 }: { icon: NavIconName; tone?: 'solid' | 'soft'; size?: number }) {
  const c = useColors();
  const solid = tone === 'solid';
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: solid ? c.brand : c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      <NavIcon name={icon} size={Math.round(size * 0.5)} color={solid ? c.onBrand : c.brandDeep} active weight={2.2} />
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
