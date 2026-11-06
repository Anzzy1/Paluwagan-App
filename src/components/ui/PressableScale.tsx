import * as Haptics from 'expo-haptics';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

export function PressableScale({
  style,
  scaleTo = 0.97,
  hapticOnPress = true,
  onPress,
  disabled,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={() => {
        scale.set(withSpring(scaleTo, { damping: 15, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 12, stiffness: 300 }));
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic('light');
        onPress?.(e);
      }}
      style={[style, animated, disabled && { opacity: 0.5 }]}
    />
  );
}
