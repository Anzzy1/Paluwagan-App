import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavIcon, type NavIconName } from '@/components/NavIcons';
import { NewCircleSheet } from '@/components/NewCircleSheet';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDark } from '@/lib/prefs';

const TABS: { name: string; icon: NavIconName; label: string }[] = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'circles', icon: 'circles', label: 'Circles' },
  { name: 'ipon', icon: 'ipon', label: 'Ipon' },
  { name: 'activity', icon: 'activity', label: 'Activity' },
  { name: 'profile', icon: 'profile', label: 'Profile' },
];

const PAD_X = 5;
const PAD_Y = 5;
const ICON_H = 26;
/** Gap between the pill and the tab edges. */
const PILL_INSET = 1;
const SPRING = { damping: 17, stiffness: 210, mass: 0.8 };

type TabButtonProps = TabTriggerSlotProps & { icon: NavIconName; label: string; index: number; onFocused: (i: number) => void };

function TabButton({ icon, label, index, onFocused, isFocused, onPress, ref: _ref, ...props }: TabButtonProps) {
  const c = useColors();
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.set(withSpring(isFocused ? 1 : 0, SPRING));
    if (isFocused) onFocused(index);
  }, [isFocused, index, onFocused, progress]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.06 * progress.get() }],
  }));

  return (
    <Pressable
      {...props}
      onPress={(e) => {
        if (!isFocused) haptic('light');
        onPress?.(e);
      }}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}>
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <NavIcon name={icon} size={22} active={isFocused} color={isFocused ? c.onBrand : c.textFaint} />
      </Animated.View>
      <Text
        variant="caption"
        numberOfLines={1}
        style={{ fontSize: 11, letterSpacing: 0.1, fontWeight: isFocused ? '700' : '500' }}
        color={isFocused ? c.onBrand : c.textFaint}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Mobile bottom navigation: floating bar with a sliding gradient pill, plus a round quick-add button. */
export function TabBar() {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [barW, setBarW] = useState(0);
  const [active, setActive] = useState(0);
  const x = useSharedValue(0);
  const placed = useRef(false);

  const tabW = barW > 0 ? (barW - PAD_X * 2) / TABS.length : 0;

  useEffect(() => {
    if (!tabW) return;
    const target = PAD_X + active * tabW + PILL_INSET;
    // First placement jumps; after that the pill glides between tabs.
    x.set(placed.current ? withSpring(target, SPRING) : target);
    placed.current = true;
  }, [active, tabW, x]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const shadow = { shadowColor: c.shadow, shadowOpacity: dark ? 0 : 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 };
  const glow = { shadowColor: c.brand, shadowOpacity: dark ? 0.45 : 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } };
  const grad = (dark ? ['#4BE08D', '#1FA85C'] : ['#2BC864', '#12813B']) as [string, string];

  return (
    <>
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
        <View
          onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
          style={[styles.bar, { backgroundColor: c.surface, borderColor: dark ? c.border : 'rgba(12,20,16,0.04)' }, shadow]}>
          {tabW > 0 && (
            <Animated.View pointerEvents="none" style={[styles.pill, { width: tabW - PILL_INSET * 2 }, glow, pillStyle]}>
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
              <View style={styles.pillShine} />
            </Animated.View>
          )}
          {TABS.map((t, i) => (
            <TabTrigger key={t.name} name={t.name} asChild>
              <TabButton icon={t.icon} label={t.label} index={i} onFocused={setActive} />
            </TabTrigger>
          ))}
        </View>
        <PressableScale onPress={() => setOpen(true)} scaleTo={0.9} accessibilityLabel="New circle" style={[styles.plus, glow, { shadowRadius: 12, shadowOpacity: 0.3, elevation: 8 }]}>
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 31 }]} />
          <View style={[styles.plusRing, { borderColor: 'rgba(255,255,255,0.28)' }]} />
          <Feather name="plus" size={28} color={c.onBrand} />
        </PressableScale>
      </View>
      <NewCircleSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: { flex: 1, flexDirection: 'row', borderRadius: 28, borderWidth: 1, paddingVertical: PAD_Y, paddingHorizontal: PAD_X },
  pill: { position: 'absolute', top: PAD_Y, bottom: PAD_Y, left: 0, borderRadius: 22 },
  pillShine: { position: 'absolute', top: 0.5, left: 16, right: 16, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 6 },
  iconWrap: { height: ICON_H, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  plusRing: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 27, borderWidth: 1 },
});
