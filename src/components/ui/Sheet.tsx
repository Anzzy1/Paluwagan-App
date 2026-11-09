import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  const drag = useSharedValue(0); // how far the sheet is pulled down, in px

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      drag.set(0);
      // Slides straight up and stops: no bounce.
      p.set(withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    } else {
      p.set(
        withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [open, p, drag]);

  // Pull the top of the sheet (handle + title) down to close it, like iOS sheets.
  const pan = usePanGesture({
    enabled: !desktop,
    activeOffsetY: 6,
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      // Free downward; a little resistance if pulled up.
      drag.set(e.translationY > 0 ? e.translationY : e.translationY / 6);
    },
    onDeactivate: (e) => {
      if (e.translationY > 110 || e.velocityY > 900) runOnJS(onClose)();
      else drag.set(withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }));
    },
  });

  const panelStyle = useAnimatedStyle(() =>
    desktop
      ? { opacity: p.get(), transform: [{ scale: 0.96 + 0.04 * p.get() }] }
      : { transform: [{ translateY: (1 - p.get()) * 700 + drag.get() }] },
  );
  const backdropStyle = useAnimatedStyle(() => ({ opacity: p.get() * Math.max(0, 1 - Math.max(0, drag.get()) / 500) }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Gestures inside a Modal need their own root view. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
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
            <GestureDetector gesture={pan} touchAction={desktop ? undefined : 'none'}>
              <View>
                {!desktop && (
                  <View style={styles.grab} accessibilityLabel="Drag down to close">
                    <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
                  </View>
                )}
                {(title || desktop) && (
                  <View style={styles.head}>
                    <View style={{ flex: 1, gap: 2 }}>
                      {title && <Text variant="h1">{title}</Text>}
                      {subtitle && <Text tone="muted">{subtitle}</Text>}
                    </View>
                    {desktop && <IconButton icon="x" size={34} onPress={onClose} label="Close" />}
                  </View>
                )}
              </View>
            </GestureDetector>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 0,
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
  // Taller touch area around the handle so it's easy to grab.
  grab: { paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
});
