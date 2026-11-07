import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { DRAW_STYLES, type DrawGameProps } from '@/components/draw/common';
import { DRAW_TINT, DrawArt } from '@/components/draw/DrawArt';
import { EnvelopesDraw } from '@/components/draw/Envelopes';
import { HorseRace } from '@/components/draw/HorseRace';
import { LotteryBalls } from '@/components/draw/LotteryBalls';
import { WheelDraw } from '@/components/draw/Wheel';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import type { DrawStyle } from '@/lib/local';
import { useColors, useIsDark, useIsDesktop } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

export function DrawStylePicker({ value, onChange }: { value: DrawStyle | null; onChange: (s: DrawStyle) => void }) {
  const c = useColors();
  const dark = useIsDark();
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
            <View style={[styles.art, { backgroundColor: dark ? DRAW_TINT[s.id].dark : DRAW_TINT[s.id].light }]}>
              <DrawArt style={s.id} size={52} />
            </View>
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

/** One row per game for "replay the draw": illustration + title. */
export function DrawReplayList({ onPick }: { onPick: (s: DrawStyle) => void }) {
  const c = useColors();
  const dark = useIsDark();
  return (
    <View style={{ gap: 8 }}>
      {DRAW_STYLES.map((d) => (
        <PressableScale key={d.id} onPress={() => onPick(d.id)} scaleTo={0.98} accessibilityLabel={d.title} style={[styles.replay, { backgroundColor: c.surfaceAlt }]}>
          <View style={[styles.replayArt, { backgroundColor: dark ? DRAW_TINT[d.id].dark : DRAW_TINT[d.id].light }]}>
            <DrawArt style={d.id} size={30} />
          </View>
          <Text variant="bodyBold" style={{ flex: 1 }}>
            {d.title}
          </Text>
          <Feather name="play" size={16} color={c.brandText} />
        </PressableScale>
      ))}
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
  art: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  replay: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 8, paddingRight: 14, borderRadius: radius.md, minHeight: 56 },
  replayArt: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
