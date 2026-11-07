import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DRAW_STYLES } from '@/components/draw/common';
import { DrawStage, DrawStylePicker } from '@/components/draw/DrawStage';
import { VerifyCard } from '@/components/draw/VerifyCard';
import { Mascot } from '@/components/Mascot';
import { Avatar, Notice } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Confetti } from '@/components/ui/Confetti';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { shortDate } from '@/lib/format';
import { commitDraw, prepareDraw, useManagedCircle, type DrawStyle } from '@/lib/local';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

export default function ManagedDraw() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const circle = useManagedCircle(id);
  const [style, setStyle] = useState<DrawStyle | null>(circle?.draw_style ?? null);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(0);

  if (!circle) {
    return (
      <Screen back title="Circle not found">
        <View />
      </Screen>
    );
  }
  const participants = circle.members.map((m) => ({ id: m.id, name: m.name }));
  const drawn = !!circle.order;

  const start = async () => {
    if (!style) return;
    setBusy(true);
    try {
      // Commit first, then play: the result is locked in before anyone sees the animation.
      const draw = await prepareDraw(circle.id);
      commitDraw(circle.id, draw, style);
      setDone(false);
      setPlaying(true);
    } catch (e) {
      notifyError(e, 'Couldn’t start the draw');
    } finally {
      setBusy(false);
    }
  };

  const finished = () => {
    setDone(true);
    setConfetti(Date.now());
  };

  const results = drawn && (
    <Card padded={false}>
      <View style={styles.head}>
        <Text variant="h3">Payout order</Text>
        <Text variant="caption" tone="faint">
          {DRAW_STYLES.find((s) => s.id === circle.draw_style)?.title}
        </Text>
      </View>
      {circle.order!.map((mid, i) => {
        const m = circle.members.find((x) => x.id === mid);
        const r = circle.rounds[i];
        return (
          <View key={mid} style={[styles.row, { borderTopColor: c.border }]}>
            <View style={[styles.num, { backgroundColor: c.ink }]}>
              <Text variant="smallBold" tone="onInk">
                {i + 1}
              </Text>
            </View>
            <Avatar name={m?.name} seed={mid} size={32} />
            <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
              {m?.name}
            </Text>
            {r && (
              <Text variant="caption" tone="faint">
                Payout {shortDate(r.due_date)}
              </Text>
            )}
          </View>
        );
      })}
    </Card>
  );

  // ---------------- choose a style
  if (!drawn && !playing) {
    return (
      <Screen back title="Time for the bunutan!" subtitle={`${circle.name} · ${participants.length} members. Pick how you want to draw the payout order.`}>
        <View style={[styles.intro, { backgroundColor: c.brandSoft }]}>
          <Mascot size={84} mood="excited" pose="cheer" />
          <Text variant="bodyMedium" style={{ flex: 1 }}>
            Gather everyone around! The order is locked in fairly the moment you start, so the game can’t be redone to change the result.
          </Text>
        </View>
        <DrawStylePicker value={style} onChange={setStyle} />
        <Button title={style ? `Start: ${DRAW_STYLES.find((s) => s.id === style)?.title}` : 'Pick a draw style'} icon="play" variant="brand" disabled={!style} loading={busy} onPress={start} />
      </Screen>
    );
  }

  // ---------------- play / results
  return (
    <View style={{ flex: 1 }}>
      <Screen
        back
        title={playing && !done ? DRAW_STYLES.find((s) => s.id === (style ?? circle.draw_style))?.title ?? 'Draw' : 'Draw results'}
        subtitle={circle.name}>
        {playing ? (
          <Card style={{ paddingVertical: 24 }}>
            <DrawStage style={style ?? circle.draw_style ?? 'balls'} participants={participants} order={circle.order ?? []} onDone={finished} />
          </Card>
        ) : null}

        {(!playing || done) && (
          <Columns
            main={
              <>
                {done && (
                  <Notice tone="success" icon="check-circle" title="Payout order is set!" body="The circle has started. Track payments from the circle page." />
                )}
                {results}
                <Button title="Go to circle" icon="arrow-right" onPress={() => router.replace(`/managed/${circle.id}` as Href)} />
              </>
            }
            side={
              <>
                {circle.seed && circle.seed_hash && circle.order && (
                  <VerifyCard seed={circle.seed} seedHash={circle.seed_hash} groups={circle.members.map((m) => m.id)} order={circle.order} />
                )}
                <Card style={{ gap: 10 }}>
                  <Text variant="h3">Replay for everyone</Text>
                  <Text variant="small" tone="muted">
                    Show the same result again with any game.
                  </Text>
                  <View style={{ gap: 8 }}>
                    {DRAW_STYLES.map((d) => (
                      <Button
                        key={d.id}
                        title={`${d.emoji}  ${d.title}`}
                        variant="secondary"
                        size="md"
                        onPress={() => {
                          setStyle(d.id);
                          setDone(false);
                          setPlaying(false);
                          setTimeout(() => setPlaying(true), 0);
                        }}
                      />
                    ))}
                  </View>
                </Card>
              </>
            }
          />
        )}
      </Screen>
      <Confetti run={confetti} />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  num: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
