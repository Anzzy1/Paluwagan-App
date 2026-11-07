import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { DRAW_STYLES, type DrawGameProps } from '@/components/draw/common';
import { EnvelopesDraw } from '@/components/draw/Envelopes';
import { HorseRace } from '@/components/draw/HorseRace';
import { LotteryBalls } from '@/components/draw/LotteryBalls';
import { WheelDraw } from '@/components/draw/Wheel';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import type { DrawStyle } from '@/lib/local';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

export function DrawStylePicker({ value, onChange }: { value: DrawStyle | null; onChange: (s: DrawStyle) => void }) {
  const c = useColors();
  const desktop = useIsDesktop();
  return (
    <View style={styles.grid}>
      {DRAW_STYLES.map((s) => {
        const sel = value === s.id;
        return (
          <PressableScale
            key={s.id}
            onPress={() => onChange(s.id)}
            style={[
              styles.option,
              { width: desktop ? '23.5%' : '48%', backgroundColor: sel ? c.brandSoft : c.surface, borderColor: sel ? c.brand : c.border },
            ]}>
            <Text style={{ fontSize: 40, lineHeight: 48 }}>{s.emoji}</Text>
            <Text variant="h3" center>
              {s.title}
            </Text>
            <Text variant="caption" tone="muted" center>
              {s.body}
            </Text>
            {sel && (
              <View style={[styles.check, { backgroundColor: c.brand }]}>
                <Feather name="check" size={12} color={c.onBrand} />
              </View>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Renders the chosen draw game. The `order` is decided beforehand by the fair seeded shuffle. */
export function DrawStage({ style, ...props }: DrawGameProps & { style: DrawStyle }) {
  if (style === 'wheel') return <WheelDraw {...props} />;
  if (style === 'race') return <HorseRace {...props} />;
  if (style === 'envelopes') return <EnvelopesDraw {...props} />;
  return <LotteryBalls {...props} />;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  option: { borderRadius: radius.lg, borderWidth: 2, padding: 16, alignItems: 'center', gap: 6, minHeight: 168 },
  check: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
