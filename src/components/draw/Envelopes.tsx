import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { radius } from '@/theme/tokens';

function Envelope({ name, number, color, open, onOpen }: { name: string; number: number; color: string; open: boolean; onOpen: () => void }) {
  const flip = useSharedValue(1);
  const [face, setFace] = useState(open);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: flip.get() }] }));

  const tap = () => {
    if (face) return;
    haptic('medium');
    flip.set(
      withSequence(
        withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.back(2)) }),
      ),
    );
    setTimeout(() => {
      setFace(true);
      onOpen();
    }, 160);
  };

  const shown = face || open;
  return (
    <PressableScale onPress={tap} hapticOnPress={false} scaleTo={0.94} style={styles.cell}>
      <Animated.View style={[styles.env, { backgroundColor: shown ? '#FFFFFF' : color, borderColor: color }, style]}>
        {shown ? (
          <>
            <Text variant="overline" color={color}>
              Slot
            </Text>
            <Text variant="hero" color={color} style={{ fontSize: 40, lineHeight: 44 }}>
              {number}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.flap} />
            <View style={[styles.seal, { borderColor: color }]}>
              <Feather name="star" size={14} color={color} />
            </View>
            <Text variant="caption" color="rgba(255,255,255,0.85)" style={{ marginTop: 8 }}>
              Tap to open
            </Text>
          </>
        )}
      </Animated.View>
      <Text variant="smallBold" numberOfLines={1} center>
        {shortName(name, 12)}
      </Text>
    </PressableScale>
  );
}

/** Lucky Envelopes (bunot): each member opens their own sealed envelope to see their slot. */
export function EnvelopesDraw({ participants, order, onDone }: DrawGameProps) {
  const [opened, setOpened] = useState<string[]>([]);
  const [all, setAll] = useState(false);

  const markOpen = (id: string) =>
    setOpened((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (next.length === participants.length) setTimeout(onDone, 600);
      return next;
    });

  return (
    <View style={{ gap: 16 }}>
      <Text variant="small" tone="muted" center>
        Pass the device around: each member taps the envelope with their name.
      </Text>
      <View style={styles.grid}>
        {participants.map((p, i) => (
          <Envelope key={p.id} name={p.name} number={order.indexOf(p.id) + 1} color={colorAt(i)} open={all} onOpen={() => markOpen(p.id)} />
        ))}
      </View>
      {opened.length < participants.length && !all && (
        <Button
          title="Open all envelopes"
          variant="secondary"
          size="md"
          full={false}
          style={{ alignSelf: 'center' }}
          onPress={() => {
            setAll(true);
            haptic('success');
            setTimeout(onDone, 600);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  cell: { width: 104, gap: 6 },
  env: { height: 120, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flap: {
    position: 'absolute',
    top: -52,
    width: 104,
    height: 104,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  seal: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
