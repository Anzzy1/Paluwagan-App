import { Feather } from '@expo/vector-icons';
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

/** Paluwagan is the app's core, so it sits in the middle, a bit wider and highlighted. */
const TABS: { name: string; icon: NavIconName; label: string; featured?: boolean }[] = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'ipon', icon: 'ipon', label: 'Ipon' },
  { name: 'circles', icon: 'circles', label: 'Paluwagan', featured: true },
  { name: 'activity', icon: 'activity', label: 'Activity' },
  { name: 'profile', icon: 'profile', label: 'Profile' },
];
const WEIGHT = (featured?: boolean) => (featured ? 1.6 : 1);
const TOTAL_WEIGHT = TABS.reduce((s, t) => s + WEIGHT(t.featured), 0);

const PAD_X = 5;
const PAD_Y = 5;
const ICON_H = 26;
/** Gap between the pill and the tab edges. */
const PILL_INSET = 1;
const SPRING = { damping: 17, stiffness: 210, mass: 0.8 };

type TabButtonProps = TabTriggerSlotProps & { icon: NavIconName; label: string; index: number; featured?: boolean; onFocused: (i: number) => void };

function TabButton({ icon, label, index, featured, onFocused, isFocused, onPress, ref: _ref, ...props }: TabButtonProps) {
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
      style={[styles.tab, { flex: WEIGHT(featured) }]}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}>
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <NavIcon name={icon} size={featured ? 25 : 22} active={isFocused || featured} color={isFocused ? c.onBrand : featured ? c.brandText : c.textFaint} />
      </Animated.View>
      <Text
        variant="caption"
        numberOfLines={1}
        style={{ fontSize: featured ? 12 : 11, letterSpacing: featured ? 0 : 0.1, fontWeight: isFocused || featured ? '700' : '500' }}
        color={isFocused ? c.onBrand : featured ? c.brandText : c.textFaint}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Mobile bottom navigation: floating bar with a sliding brand-green pill, plus a round quick-add button. */
export function TabBar() {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [barW, setBarW] = useState(0);
  const [active, setActive] = useState(0);
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);

  const unit = barW > 0 ? (barW - PAD_X * 2) / TOTAL_WEIGHT : 0;

  useEffect(() => {
    if (!unit) return;
    const before = TABS.slice(0, active).reduce((s, t) => s + WEIGHT(t.featured), 0);
    const targetX = PAD_X + before * unit + PILL_INSET;
    const targetW = WEIGHT(TABS[active].featured) * unit - PILL_INSET * 2;
    // First placement jumps; after that the pill glides (and stretches) between tabs.
    x.set(placed.current ? withSpring(targetX, SPRING) : targetX);
    w.set(placed.current ? withSpring(targetW, SPRING) : targetW);
    placed.current = true;
  }, [active, unit, x, w]);

  const pillStyle = useAnimatedStyle(() => ({ width: w.get(), transform: [{ translateX: x.get() }] }));

  const shadow = { shadowColor: c.shadow, shadowOpacity: dark ? 0 : 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 };

  return (
    <>
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
        <View
          onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
          style={[styles.bar, { backgroundColor: c.surface, borderColor: dark ? c.border : 'rgba(12,20,16,0.04)' }, shadow]}>
          {unit > 0 && <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: c.brand }, pillStyle]} />}
          {TABS.map((t, i) => (
            <TabTrigger key={t.name} name={t.name} asChild>
              <TabButton icon={t.icon} label={t.label} index={i} featured={t.featured} onFocused={setActive} />
            </TabTrigger>
          ))}
        </View>
        <PressableScale onPress={() => setOpen(true)} scaleTo={0.9} accessibilityLabel="New paluwagan" style={[styles.plus, { backgroundColor: c.brand }, shadow]}>
          <Feather name="plus" size={28} color={c.onBrand} />
        </PressableScale>
      </View>
      <NewCircleSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { flex: 1, flexDirection: 'row', borderRadius: 28, borderWidth: 1, paddingVertical: PAD_Y, paddingHorizontal: PAD_X },
  pill: { position: 'absolute', top: PAD_Y, bottom: PAD_Y, left: 0, borderRadius: 22 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 6 },
  iconWrap: { height: ICON_H, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
});
