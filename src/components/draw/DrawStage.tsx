import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ClawMachine } from '@/components/draw/ClawMachine';
import { DRAW_STYLES, gameOf, type DrawGameProps, type GameId } from '@/components/draw/common';
import { DRAW_TINT, DrawArt } from '@/components/draw/DrawArt';
import { EnvelopesDraw } from '@/components/draw/Envelopes';
import { Plinko } from '@/components/draw/Plinko';
import { SlotMachine } from '@/components/draw/SlotMachine';
import { WheelDraw } from '@/components/draw/Wheel';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { confirmAction } from '@/lib/alert';
import type { DrawStyle } from '@/lib/local';
import { useColors, useIsDark, useIsDesktop, usePrefs } from '@/lib/prefs';
import { useGameMusic } from '@/lib/sfx';
import { radius } from '@/theme/tokens';

/**
 * Pick a game and start: tapping a game asks "Play this?" and starts the draw on Continue.
 * Only one game can be played, so there's no separate select-then-start step.
 */
export function DrawStylePicker({ onStart, disabled = false }: { onStart: (s: GameId) => void; disabled?: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  const desktop = useIsDesktop();
  const ask = (s: (typeof DRAW_STYLES)[number]) =>
    confirmAction(
      `Play ${s.title}?`,
      `${s.body} The payout order is locked in the moment the draw starts, so it can’t be redone.`,
      () => onStart(s.id),
      { confirmText: 'Start draw', icon: 'play' },
    );
  return (
    <View style={styles.grid}>
      {DRAW_STYLES.map((s) => {
        return (
          <PressableScale
            key={s.id}
            onPress={() => ask(s)}
            disabled={disabled}
            accessibilityLabel={`Play ${s.title}`}
            style={[styles.option, { width: desktop ? '23.5%' : '48%', backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.art, { backgroundColor: dark ? DRAW_TINT[s.id].dark : DRAW_TINT[s.id].light }]}>
              <DrawArt style={s.id} size={52} />
            </View>
            <Text variant="h3" center>
              {s.title}
            </Text>
            <Text variant="caption" tone="muted" center>
              {s.body}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** One row per game for "replay the draw": illustration + title. */
export function DrawReplayList({ onPick }: { onPick: (s: GameId) => void }) {
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
  useGameMusic();
  const game = gameOf(style);
  return (
    <View style={{ gap: 6 }}>
      <SoundButton />
      {game === 'wheel' && <WheelDraw {...props} />}
      {game === 'envelopes' && <EnvelopesDraw {...props} />}
      {game === 'slots' && <SlotMachine {...props} />}
      {game === 'plinko' && <Plinko {...props} />}
      {game === 'claw' && <ClawMachine {...props} />}
    </View>
  );
}

/** Small speaker toggle for music + sound effects (same as Settings → Game sounds). */
function SoundButton() {
  const c = useColors();
  const { toggles, setToggle } = usePrefs();
  const on = toggles.sounds;
  return (
    <PressableScale
      onPress={() => setToggle('sounds', !on)}
      hapticOnPress={false}
      accessibilityLabel={on ? 'Mute game sounds' : 'Turn on game sounds'}
      style={[styles.sound, { backgroundColor: on ? c.brandSoft : c.surfaceAlt }]}>
      <Feather name={on ? 'volume-2' : 'volume-x'} size={16} color={on ? c.brandText : c.textMuted} />
      <Text variant="caption" color={on ? c.brandText : c.textMuted}>
        {on ? 'Sound on' : 'Muted'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  option: { borderRadius: radius.lg, borderWidth: 2, padding: 16, alignItems: 'center', gap: 6, minHeight: 168 },
  art: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  replay: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 8, paddingRight: 14, borderRadius: radius.md, minHeight: 56 },
  replayArt: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sound: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16 },
});
