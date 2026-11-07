import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { font, radius } from '@/theme/tokens';

const SIZE = 300;
const R = SIZE / 2 - 6;
const C = SIZE / 2;

function point(deg: number, r = R) {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function slicePath(a0: number, a1: number) {
  if (a1 - a0 >= 359.99) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
  const p0 = point(a0);
  const p1 = point(a1);
  return `M ${C} ${C} L ${p0.x} ${p0.y} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`;
}

/** Spin the Wheel: one spin per payout slot; the pointer lands on the next person in the fair order. */
export function WheelDraw({ participants, order, onDone }: DrawGameProps) {
  const c = useColors();
  const [revealed, setRevealed] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [lastWinner, setLastWinner] = useState<string | null>(null);
  const rot = useSharedValue(0);
  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));

  const remaining = participants.filter((p) => !revealed.includes(p.id));
  const n = remaining.length;
  const step = 360 / Math.max(1, n);
  const colorOf = (id: string) => colorAt(participants.findIndex((p) => p.id === id));
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? '';

  const finishSpin = (winner: string) => {
    haptic('success');
    setLastWinner(winner);
    setSpinning(false);
    const next = [...revealed, winner];
    // When one person is left, they take the last slot automatically.
    const left = participants.filter((p) => !next.includes(p.id));
    if (left.length === 1) next.push(left[0].id);
    rot.set(0);
    setRevealed(next);
    if (next.length >= order.length) setTimeout(onDone, 900);
  };

  const spin = () => {
    if (spinning || n === 0) return;
    const winner = order[revealed.length];
    const w = remaining.findIndex((p) => p.id === winner);
    const wobble = (((revealed.length + 1) * 37) % 10) / 10 - 0.5; // land off-centre so it feels natural
    const center = (w + 0.5) * step + wobble * step * 0.5;
    const target = 360 * 6 + ((360 - center) % 360);
    setSpinning(true);
    setLastWinner(null);
    haptic('medium');
    rot.set(
      withTiming(target, { duration: 3800, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(finishSpin)(winner);
      }),
    );
  };

  const fontSize = n > 10 ? 10 : n > 6 ? 12 : 14;

  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <View style={{ width: SIZE, height: SIZE + 14 }}>
        <Animated.View style={[{ width: SIZE, height: SIZE, marginTop: 14 }, wheelStyle]}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={C} cy={C} r={R + 4} fill={c.ink} />
            {remaining.map((p, i) => {
              const a0 = i * step;
              const mid = a0 + step / 2;
              return (
                <G key={p.id}>
                  <Path d={slicePath(a0, a0 + step)} fill={colorOf(p.id)} stroke="#FFFFFF" strokeWidth={2} />
                  <G
                    transform={
                      mid > 90 && mid < 270
                        ? `rotate(${mid} ${C} ${C}) rotate(180 ${C} ${C - R * 0.62})`
                        : `rotate(${mid} ${C} ${C})`
                    }>
                    <SvgText x={C} y={C - R * 0.62 + fontSize / 3} fill="#FFFFFF" fontSize={fontSize} fontWeight="800" textAnchor="middle" fontFamily={font.bold}>
                      {shortName(p.name, n > 8 ? 8 : 11)}
                    </SvgText>
                  </G>
                </G>
              );
            })}
            {[...Array(Math.max(n, 1) * 2)].map((_, i) => {
              const pt = point((i * 360) / (Math.max(n, 1) * 2), R + 0.5);
              return <Circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill="#FFFFFF" opacity={0.9} />;
            })}
            <Circle cx={C} cy={C} r={26} fill="#FFFFFF" stroke={c.ink} strokeWidth={4} />
            <SvgText x={C} y={C + 6} fontSize={18} fontWeight="900" textAnchor="middle" fill={c.ink} fontFamily={font.black}>
              ₱
            </SvgText>
          </Svg>
        </Animated.View>
        {/* pointer */}
        <Svg width={34} height={34} style={styles.pointer}>
          <Polygon points="17,32 4,4 30,4" fill={c.gold} stroke={c.ink} strokeWidth={3} strokeLinejoin="round" />
        </Svg>
      </View>

      {lastWinner && (
        <Animated.View entering={ZoomIn.springify()} style={[styles.winner, { backgroundColor: colorOf(lastWinner) }]}>
          <Text variant="h2" color="#fff">
            #{revealed.indexOf(lastWinner) + 1} · {nameOf(lastWinner)}!
          </Text>
        </Animated.View>
      )}

      {revealed.length < order.length ? (
        <Button
          title={spinning ? 'Spinning…' : `Spin for slot #${revealed.length + 1}`}
          icon="refresh-cw"
          variant="brand"
          onPress={spin}
          disabled={spinning}
          full={false}
          style={{ paddingHorizontal: 28, alignSelf: 'center' }}
        />
      ) : (
        <Text variant="h3" tone="brand">
          All slots drawn!
        </Text>
      )}

      {revealed.length > 0 && (
        <View style={styles.results}>
          {revealed.map((id, i) => (
            <View key={id} style={[styles.result, { backgroundColor: c.surfaceAlt }]}>
              <View style={[styles.dot, { backgroundColor: colorOf(id) }]}>
                <Text variant="caption" color="#fff">
                  {i + 1}
                </Text>
              </View>
              <Text variant="smallBold" numberOfLines={1}>
                {nameOf(id)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: { position: 'absolute', top: 0, left: SIZE / 2 - 17 },
  winner: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill },
  results: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: radius.pill, maxWidth: 170 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
