import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  // PanResponder (built into React Native) works the same on native and mobile Safari.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        // Free downward; a little resistance if pulled up.
        onPanResponderMove: (_, g) => drag.set(g.dy > 0 ? g.dy : g.dy / 6),
        onPanResponderRelease: (_, g) => {
          // vy is px per ms here, so 0.9 ≈ a quick flick.
          if (g.dy > 110 || g.vy > 0.9) onClose();
          else drag.set(withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }));
        },
        onPanResponderTerminate: () => drag.set(withTiming(0, { duration: 200 })),
      }),
    [drag, onClose],
  );

  const panelStyle = useAnimatedStyle(() =>
    desktop
      ? { opacity: p.get(), transform: [{ scale: 0.96 + 0.04 * p.get() }] }
      : { transform: [{ translateY: (1 - p.get()) * 700 + drag.get() }] },
  );
  const backdropStyle = useAnimatedStyle(() => ({ opacity: p.get() * Math.max(0, 1 - Math.max(0, drag.get()) / 500) }));

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
            {/* touchAction stops mobile Safari from scrolling the page instead of dragging. */}
            <View {...(desktop ? {} : pan.panHandlers)} style={desktop ? undefined : ({ touchAction: 'none' } as never)}>
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
