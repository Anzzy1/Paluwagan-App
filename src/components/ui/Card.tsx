import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { useColors, useIsDark } from '@/lib/prefs';
import { circleTints, radius, type CircleTint } from '@/theme/tokens';

export function useTint(tint?: CircleTint | string) {
  const dark = useIsDark();
  const t = circleTints[(tint as CircleTint) in circleTints ? (tint as CircleTint) : 'mango'];
  return { bg: dark ? t.dark : t.light, strong: t.strong };
}

export function Card({
  children,
  onPress,
  tint,
  padded = true,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  tint?: CircleTint | string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const t = useTint(tint);
  const base: ViewStyle = {
    backgroundColor: tint ? t.bg : c.surface,
    borderRadius: radius.lg,
    borderWidth: tint ? 0 : 1,
    borderColor: c.border,
    padding: padded ? 18 : 0,
    overflow: 'hidden',
  };
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={[base, style]}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
