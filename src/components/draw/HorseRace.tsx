import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

/** Width of the lane number + name column. */
const GUTTER = 96;
const HORSE = 34;

/** Deterministic pseudo-random per lane so the race looks lively but stays reproducible. */
function rnd(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function Lane({ name, color, rank, index, trackWidth, go }: { name: string; color: string; rank: number; index: number; trackWidth: number; go: number }) {
  const c = useColors();
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * Math.max(0, trackWidth - GUTTER - HORSE - 26) }] }));

  useEffect(() => {
    if (!go) return;
    // Finishing time is fixed by rank (fair order); the mid-race surge varies so horses overtake each other.
    const total = 4200 + rank * 380;
    const midAt = 0.3 + rnd(index + go) * 0.4;
    const midPos = 0.25 + rnd(index * 7 + go) * 0.5;
    x.set(0);
    x.set(
      withDelay(
        200,
        withSequence(
          withTiming(midPos, { duration: total * midAt, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: total * (1 - midAt), easing: Easing.out(Easing.quad) }),
        ),
      ),
    );
  }, [go, rank, index, x]);

  return (
    <View style={[styles.lane, { backgroundColor: index % 2 ? c.surfaceAlt : c.surface, borderColor: c.border }]}>
      <View style={[styles.laneNo, { backgroundColor: color }]}>
        <Text variant="caption" color="#fff">
          {index + 1}
        </Text>
      </View>
      <Text variant="caption" numberOfLines={1} style={styles.laneName}>
        {shortName(name, 8)}
      </Text>
      <Animated.View style={[styles.horse, style]}>
        <MaterialCommunityIcons name="horse-variant-fast" size={32} color={color} />
        <View style={[styles.saddle, { backgroundColor: color }]} />
      </Animated.View>
    </View>
  );
}

/** Horse Race: finishing order = the fair payout order. */
export function HorseRace({ participants, order, onDone }: DrawGameProps) {
  const c = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const [go, setGo] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const start = () => {
    if (count !== null) return;
    setFinished(false);
    let n = 3;
    setCount(n);
    haptic('light');
    const t = setInterval(() => {
      n -= 1;
      if (n === 0) {
        clearInterval(t);
        setCount(null);
        setGo((g) => g + 1);
        haptic('medium');
        const total = 4200 + (order.length - 1) * 380 + 600;
        setTimeout(() => {
          setFinished(true);
          haptic('success');
          onDone();
        }, total);
      } else {
        setCount(n);
        haptic('light');
      }
    }, 700);
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={[styles.track, { borderColor: c.border }]} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        <View style={styles.finish} pointerEvents="none">
          {Array.from({ length: 30 }, (_, i) => (
            <View key={i} style={{ width: 6, height: 6, backgroundColor: (Math.floor(i / 2) + i) % 2 ? '#111' : '#fff' }} />
          ))}
        </View>
        {participants.map((p, i) => (
          <Lane key={p.id} name={p.name} color={colorAt(i)} rank={order.indexOf(p.id)} index={i} trackWidth={trackWidth} go={go} />
        ))}
        {count !== null && (
          <Animated.View key={count} entering={ZoomIn} style={styles.countWrap} pointerEvents="none">
            <Text style={{ fontSize: 72, lineHeight: 80 }} color={c.ink} variant="hero">
              {count}
            </Text>
          </Animated.View>
        )}
      </View>

      {!go || finished ? (
        <Button
          title={finished ? 'Race again' : 'Start the race!'}
          icon="flag"
          variant="brand"
          full={false}
          style={{ alignSelf: 'center', paddingHorizontal: 28 }}
          onPress={start}
        />
      ) : (
        <Text variant="h3" center tone="muted">
          And they’re off!
        </Text>
      )}

      {finished && (
        <View style={{ gap: 8 }}>
          <Text variant="h3" center>
            Finish order
          </Text>
          <View style={styles.podium}>
            {order.slice(0, 3).map((id, i) => {
              const p = participants.find((x) => x.id === id)!;
              const idx = participants.findIndex((x) => x.id === id);
              return (
                <Animated.View key={id} entering={ZoomIn.delay(i * 150)} style={[styles.place, { backgroundColor: colorAt(idx), height: [110, 90, 76][i] }]}>
                  <Text variant="h1" color="#fff">
                    {['🥇', '🥈', '🥉'][i]}
                  </Text>
                  <Text variant="caption" color="#fff" numberOfLines={1}>
                    {shortName(p.name, 10)}
                  </Text>
                </Animated.View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  lane: { height: 46, justifyContent: 'center', borderBottomWidth: 1 },
  // Number + name sit in a fixed left gutter; horses run in the space after it.
  laneNo: { position: 'absolute', left: 8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  laneName: { position: 'absolute', left: 36, width: GUTTER - 40, zIndex: 1 },
  horse: { position: 'absolute', left: GUTTER, top: 6, width: HORSE, height: HORSE, alignItems: 'center' },
  saddle: { position: 'absolute', bottom: 0, width: 14, height: 4, borderRadius: 2 },
  finish: { position: 'absolute', right: 10, top: 0, bottom: 0, width: 12, flexDirection: 'row', flexWrap: 'wrap', zIndex: 0, opacity: 0.8 },
  countWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  place: { width: 96, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6 },
});
