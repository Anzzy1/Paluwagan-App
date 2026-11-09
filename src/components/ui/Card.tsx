import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { useColors, useIsDark } from '@/lib/prefs';
import { circleTints, radius, type CircleTint } from '@/theme/tokens';

export function useTint(tint?: CircleTint | string) {
  const dark = useIsDark();
  const t = circleTints[(tint as CircleTint) in circleTints ? (tint as CircleTint) : 'leaf'];
  return { soft: dark ? t.dark : t.light, strong: t.strong, grad: t.grad as unknown as [string, string] };
}

export function Card({
  children,
  onPress,
  padded = true,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const dark = useIsDark();
  // Flat white cards on a soft grey page; a hairline border only in dark mode.
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: dark ? 1 : 0,
    borderColor: c.border,
    // Longhands, not `padding`: on web the shorthand beats a paddingVertical passed in `style`.
    paddingHorizontal: padded ? 20 : 0,
    paddingVertical: padded ? 20 : 0,
    shadowColor: c.shadow,
    shadowOpacity: dark ? 0 : 0.035,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    // iOS needs visible overflow to render shadows; elsewhere clip rows to the rounded corners.
    overflow: Platform.OS === 'ios' ? 'visible' : 'hidden',
  };
  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.99} hapticOnPress={false} style={[base, style]}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
