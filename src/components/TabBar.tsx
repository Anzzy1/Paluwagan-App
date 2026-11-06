import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDark, useT } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

type IconName = ComponentProps<typeof Feather>['name'];

function TabButton({ icon, label, isFocused, ref: _ref, ...props }: TabTriggerSlotProps & { icon: IconName; label: string }) {
  const c = useColors();
  return (
    <Pressable {...props} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: isFocused }}>
      <View style={[styles.tabInner, isFocused && { backgroundColor: c.surfaceAlt }]}>
        <Feather name={icon} size={20} color={isFocused ? c.text : c.textFaint} />
      </View>
      <Text variant="small" style={{ fontSize: 10, lineHeight: 12 }} tone={isFocused ? 'default' : 'faint'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TabBar() {
  const c = useColors();
  const dark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const go = (path: '/create' | '/join') => {
    setOpen(false);
    setTimeout(() => router.push(path), 180);
  };

  return (
    <>
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
        <View
          style={[
            styles.bar,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              shadowOpacity: dark ? 0 : 0.08,
            },
          ]}>
          <TabTrigger name="index" asChild>
            <TabButton icon="home" label={t('tab.home')} />
          </TabTrigger>
          <TabTrigger name="circles" asChild>
            <TabButton icon="disc" label={t('tab.circles')} />
          </TabTrigger>
          <PressableScale onPress={() => setOpen(true)} style={[styles.plus, { backgroundColor: c.accent }]} scaleTo={0.9}>
            <Feather name="plus" size={26} color={c.accentInk} />
          </PressableScale>
          <TabTrigger name="activity" asChild>
            <TabButton icon="activity" label={t('tab.activity')} />
          </TabTrigger>
          <TabTrigger name="profile" asChild>
            <TabButton icon="user" label={t('tab.profile')} />
          </TabTrigger>
        </View>
      </View>
      <Sheet open={open} onClose={() => setOpen(false)} title="Bagong paluwagan">
        <PressableScale onPress={() => go('/create')} style={[styles.option, { backgroundColor: c.accent }]}>
          <Text style={styles.optionEmoji}>✨</Text>
          <View style={{ flex: 1 }}>
            <Text variant="h3" tone="accentInk">
              Gumawa ng circle
            </Text>
            <Text variant="small" tone="accentInk" style={{ opacity: 0.7 }}>
              Ikaw ang admin. Mag-invite ng barkada, pamilya, o officemates.
            </Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => go('/join')} style={[styles.option, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
          <Text style={styles.optionEmoji}>🔑</Text>
          <View style={{ flex: 1 }}>
            <Text variant="h3">Sumali gamit ang code</Text>
            <Text variant="small" tone="muted">
              I-type ang 6-character code o i-scan ang QR.
            </Text>
          </View>
        </PressableScale>
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabInner: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg },
  optionEmoji: { fontSize: 32, lineHeight: 40 },
});
