import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
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

/** Rounded-square icon tile with a green gradient and a white glyph. */
export function IconTile({ icon, tone = 'green', size = 48 }: { icon: IconName; tone?: keyof typeof tileGradients; size?: number }) {
  return (
    <LinearGradient
      colors={tileGradients[tone] as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={Math.round(size * 0.42)} color="#FFFFFF" />
    </LinearGradient>
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
