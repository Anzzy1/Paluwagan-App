import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

/** Bottom sheet on mobile, centred dialog on desktop. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const p = useSharedValue(0); // 0 = hidden, 1 = shown

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      // One soft settle (~5px overshoot) instead of a visible bounce.
      p.set(withSpring(1, { damping: 27, stiffness: 260 }));
    } else {
      p.set(
        withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [open, p]);

  const panelStyle = useAnimatedStyle(() =>
    desktop
      ? { opacity: p.get(), transform: [{ scale: 0.96 + 0.04 * p.get() }] }
      : { transform: [{ translateY: (1 - p.get()) * 700 }] },
  );
  const backdropStyle = useAnimatedStyle(() => ({ opacity: p.get() }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <View style={[{ flex: 1 }, desktop && styles.center]} pointerEvents="box-none">
          {!desktop && <View style={{ flex: 1 }} pointerEvents="box-none" />}
          <Animated.View
            style={[
              desktop ? styles.dialog : styles.sheet,
              { backgroundColor: c.surface, borderColor: c.border, paddingBottom: desktop ? 24 : Math.max(insets.bottom, 20) },
              panelStyle,
            ]}>
            {!desktop && <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />}
            {(title || desktop) && (
              <View style={styles.head}>
                <View style={{ flex: 1, gap: 2 }}>
                  {title && <Text variant="h1">{title}</Text>}
                  {subtitle && <Text tone="muted">{subtitle}</Text>}
                </View>
                {desktop && <IconButton icon="x" size={34} onPress={onClose} label="Close" />}
              </View>
            )}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '90%',
    borderTopWidth: 1,
  },
  dialog: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: radius.xl,
    paddingHorizontal: 24,
    paddingTop: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
});
