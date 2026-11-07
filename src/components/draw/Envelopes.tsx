import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';

import { colorAt, shortName, type DrawGameProps } from '@/components/draw/common';
import { slotLabel, SuspenseText } from '@/components/draw/Suspense';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { loop, sfx } from '@/lib/sfx';
import { Text } from '@/components/ui/Text';
import { radius } from '@/theme/tokens';

/** How long an envelope shakes before it opens. The #1 envelope shakes longest. */
const SHAKE_MS = 1300;

function Envelope({
  name,
  number,
  total,
  color,
  autoOpen,
  onOpen,
}: {
  name: string;
  number: number;
  total: number;
  color: string;
  /** Set to true to open it from "Open all". */
  autoOpen: boolean;
  onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  const flip = useSharedValue(1);
  const wiggle = useSharedValue(0);
  const [face, setFace] = useState(false);
  const [busy, setBusy] = useState(false);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: flip.get() }, { rotate: `${wiggle.get()}deg` }] }));

  const open = () => {
    if (face || busy) return;
    setBusy(true);
    const shake = reduce ? 0 : number === 1 ? SHAKE_MS * 1.6 : SHAKE_MS;
    if (shake) {
      haptic('light');
      sfx('shake', 0.8);
      setTimeout(() => sfx('shake', 1), shake * 0.5);
      if (number === 1) loop('drumroll', true, 0.7);
      // Builds from a nervous tremble to a hard shake, then flips open.
      wiggle.set(
        withSequence(
          withRepeat(withSequence(withTiming(-3, { duration: 70 }), withTiming(3, { duration: 70 })), Math.round(shake / 280)),
          withRepeat(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 })), Math.round(shake / 200)),
          withTiming(0, { duration: 60 }),
        ),
      );
    }
    setTimeout(() => {
      haptic('medium');
      loop('drumroll', false);
      sfx(number === 1 || number === total ? 'win' : 'pop');
      flip.set(
        withSequence(
          withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }),
          withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2)) }),
        ),
      );
      setTimeout(() => {
        setFace(true);
        setBusy(false);
        onOpen();
      }, 180);
    }, shake);
  };

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (autoOpen) openRef.current();
  }, [autoOpen]);

  const tag = number === 1 ? 'First payout' : number === total ? 'Last payout' : null;
  return (
    <PressableScale onPress={open} hapticOnPress={false} scaleTo={0.94} style={styles.cell}>
      <Animated.View style={[styles.env, { backgroundColor: face ? '#FFFFFF' : color, borderColor: color }, style]}>
        {face ? (
          <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center' }}>
            <Text variant="overline" color={color}>
              Slot
            </Text>
            <Text variant="hero" color={color} style={{ fontSize: 40, lineHeight: 44 }}>
              {number}
            </Text>
            {tag && (
              <Text variant="caption" color={color} style={{ fontWeight: '700' }}>
                {tag}
              </Text>
            )}
          </Animated.View>
        ) : (
          <>
            <View style={styles.flap} />
            <View style={[styles.seal, { borderColor: color }]}>
              <Feather name="star" size={14} color={color} />
            </View>
            <Text variant="caption" color="rgba(255,255,255,0.85)" style={{ marginTop: 8 }}>
              {busy ? 'Opening…' : 'Tap to open'}
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

/**
 * Lucky Envelopes (bunot): each member opens their own sealed envelope to see their slot.
 * "Reveal one by one" opens them from the LAST slot up to #1, so the first payout comes last.
 */
export function EnvelopesDraw({ participants, order, onDone }: DrawGameProps) {
  const [opened, setOpened] = useState<string[]>([]);
  const [autoIds, setAutoIds] = useState<string[]>([]);
  const [revealing, setRevealing] = useState<number | null>(null); // slot being revealed in the sequence
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const markOpen = (id: string) =>
    setOpened((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (next.length === participants.length) setTimeout(() => doneRef.current(), 900);
      return next;
    });

  const revealAll = () => {
    // Last slot first, #1 last; skip envelopes already opened by hand.
    const queue = [...order].reverse().filter((id) => !opened.includes(id));
    let delay = 0;
    queue.forEach((id) => {
      const slot = order.indexOf(id) + 1;
      setTimeout(() => {
        setRevealing(slot);
        setAutoIds((a) => [...a, id]);
      }, delay);
      delay += (slot === 1 ? SHAKE_MS * 1.6 : SHAKE_MS) + 1100;
    });
    setTimeout(() => setRevealing(null), delay);
  };

  const sequenceRunning = revealing !== null || autoIds.length > 0;
  return (
    <View style={{ gap: 16 }}>
      {revealing !== null ? (
        <SuspenseText text={`Opening ${slotLabel(revealing, order.length)}`} fast={revealing === 1} />
      ) : (
        <Text variant="small" tone="muted" center>
          Pass the device around: each member taps the envelope with their name.
        </Text>
      )}
      <View style={styles.grid}>
        {participants.map((p, i) => (
          <Envelope
            key={p.id}
            name={p.name}
            number={order.indexOf(p.id) + 1}
            total={order.length}
            color={colorAt(i)}
            autoOpen={autoIds.includes(p.id)}
            onOpen={() => markOpen(p.id)}
          />
        ))}
      </View>
      {opened.length < participants.length && !sequenceRunning && (
        <Button title="Reveal one by one" icon="eye" variant="secondary" size="md" full={false} style={{ alignSelf: 'center' }} onPress={revealAll} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  cell: { width: 104, gap: 6 },
  env: { height: 124, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
