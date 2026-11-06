import { Redirect, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ListViewToken } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { usePrefs, useColors, useIsDark, useT } from '@/lib/prefs';
import { circleTints, radius } from '@/theme/tokens';

const SLIDES = [
  { key: '1', tint: 'mango', art: ['💸', '📒', '✂️'] },
  { key: '2', tint: 'grape', art: ['🎲', '🔐', '✅'] },
  { key: '3', tint: 'leaf', art: ['🧾', '🔔', '🤝'] },
] as const;

export default function Onboarding() {
  const { onboarded, setOnboarded } = usePrefs();
  const t = useT();
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }, []);

  if (onboarded) return <Redirect href="/login" />;

  const finish = () => {
    setOnboarded(true);
    router.replace('/login');
  };
  const next = () => {
    if (index < SLIDES.length - 1) list.current?.scrollToIndex({ index: index + 1 });
    else finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}>
      <View style={styles.top}>
        <Text variant="h3">paluwagan.</Text>
        <Text variant="smallBold" tone="muted" onPress={finish}>
          Skip
        </Text>
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        keyExtractor={(s) => s.key}
        renderItem={({ item, index: i }) => {
          const tint = circleTints[item.tint];
          return (
            <View style={{ width, paddingHorizontal: 20, gap: 28, justifyContent: 'center' }}>
              <View style={[styles.art, { backgroundColor: dark ? tint.dark : tint.light }]}>
                {item.art.map((e, k) => (
                  <Animated.View
                    key={e}
                    entering={FadeInDown.delay(150 * k).springify()}
                    style={[styles.bubble, { backgroundColor: c.surface, transform: [{ rotate: `${(k - 1) * 10}deg` }], marginTop: k === 1 ? -40 : 20 }]}>
                    <Text style={{ fontSize: 44, lineHeight: 54 }}>{e}</Text>
                  </Animated.View>
                ))}
              </View>
              <View style={{ gap: 12 }}>
                <Text variant="hero">{t(`onb.${i + 1}.title` as 'onb.1.title')}</Text>
                <Text tone="muted" style={{ fontSize: 17, lineHeight: 25 }}>
                  {t(`onb.${i + 1}.body` as 'onb.1.body')}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={{ paddingHorizontal: 20, gap: 20 }}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, { backgroundColor: i === index ? c.ink : c.border, width: i === index ? 24 : 8 }]} />
          ))}
        </View>
        <Button title={index === SLIDES.length - 1 ? t('onb.start') : t('onb.next')} onPress={next} icon="arrow-right" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  art: { height: 280, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  bubble: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
});
