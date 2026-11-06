import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
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
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.ink, accent: c.accent, secondary: c.surface, ghost: 'transparent', danger: c.dangerBg }[variant];
  const fg = { primary: c.onInk, accent: c.accentInk, secondary: c.text, ghost: c.text, danger: c.danger }[variant];
  const h = { sm: 38, md: 48, lg: 58 }[size];

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
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: c.border,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Feather name={icon} size={size === 'sm' ? 15 : 18} color={fg} />}
          <Text variant={size === 'sm' ? 'smallBold' : 'bodyBold'} color={fg}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
