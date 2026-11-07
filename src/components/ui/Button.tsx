import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  full = true,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ComponentProps<typeof Feather>['name'];
  iconRight?: ComponentProps<typeof Feather>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.brand, brand: c.brand, secondary: c.border, ghost: 'transparent', danger: c.dangerBg }[variant];
  const fg = { primary: c.onBrand, brand: c.onBrand, secondary: c.text, ghost: c.textMuted, danger: c.danger }[variant];
  const h = { sm: 38, md: 46, lg: 54 }[size];
  const iconSize = size === 'sm' ? 15 : 17;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          backgroundColor: bg,
          height: h,
          paddingHorizontal: size === 'sm' ? 14 : 22,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Feather name={icon} size={iconSize} color={fg} />}
          <Text variant={size === 'sm' ? 'smallBold' : 'bodyBold'} color={fg}>
            {title}
          </Text>
          {iconRight && <Feather name={iconRight} size={iconSize} color={fg} />}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
