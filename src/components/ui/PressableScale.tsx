import * as Haptics from 'expo-haptics';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { settings } from '@/lib/prefs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web' || !settings.haptics) return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

export function PressableScale({
  style,
  scaleTo = 0.98,
  hapticOnPress = true,
  onPress,
  disabled,
  dimWhenDisabled = true,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean; dimWhenDisabled?: boolean }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      onPressIn={() => {
        scale.set(withSpring(scaleTo, { damping: 18, stiffness: 420 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 24, stiffness: 320 }));
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic('light');
        onPress?.(e);
      }}
      style={[style, animated, disabled && dimWhenDisabled && { opacity: 0.45 }, Platform.OS === 'web' && ({ cursor: disabled ? 'default' : 'pointer' } as ViewStyle)]}
    />
  );
}
