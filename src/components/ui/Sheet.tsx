import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

/** Lightweight animated bottom sheet built on Modal + Reanimated. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(600);
  const fade = useSharedValue(0);

  // Mount as soon as we're asked to open (state adjustment during render).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      y.set(withSpring(0, { damping: 22, stiffness: 220 }));
      fade.set(withTiming(1, { duration: 200 }));
    } else {
      fade.set(withTiming(0, { duration: 180 }));
      y.set(
        withTiming(600, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [open, y, fade]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 20) },
            sheetStyle,
          ]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />
          {title && (
            <Text variant="h1" style={{ marginBottom: 12 }}>
              {title}
            </Text>
          )}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '90%',
  },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
});
