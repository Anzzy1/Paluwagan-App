import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { Chip, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useDeleteGoal, useMyCircles, useSaveGoal } from '@/lib/api';
import { errMsg } from '@/lib/supabase';
import type { Goal } from '@/lib/types';

const GOAL_EMOJIS = ['🎯', '🎓', '🏠', '✈️', '📱', '🛵', '💍', '🏥', '🎄', '💻'];

export function GoalSheet({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal | null }) {
  const circles = useMyCircles();
  const save = useSaveGoal();
  const del = useDeleteGoal();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [emoji, setEmoji] = useState(GOAL_EMOJIS[0]);
  const [circleId, setCircleId] = useState<string | null>(null);

  // Reset the form each time the sheet opens (state adjustment during render).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(goal?.title ?? '');
      setTarget(goal ? String(goal.target) : '');
      setEmoji(goal?.emoji ?? GOAL_EMOJIS[0]);
      setCircleId(goal?.circle_id ?? null);
    }
  }

  const submit = () =>
    save.mutate(
      { id: goal?.id, title: title.trim(), target: Number(target), emoji, circle_id: circleId },
      { onSuccess: onClose, onError: (e) => Alert.alert('May mali', errMsg(e)) },
    );

  return (
    <Sheet open={open} onClose={onClose} title={goal ? 'I-edit ang goal' : 'Bagong Ipon Goal'}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {GOAL_EMOJIS.map((e) => (
          <PressableScale key={e} onPress={() => setEmoji(e)}>
            <View style={{ opacity: e === emoji ? 1 : 0.35, padding: 4 }}>
              <Text style={{ fontSize: 30, lineHeight: 38 }}>{e}</Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
      <Input label="Para saan?" placeholder="Tuition ni bunso" value={title} onChangeText={setTitle} />
      <Input label="Target (₱)" placeholder="20000" value={target} onChangeText={(v) => setTarget(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
      <Text variant="smallBold" tone="muted">
        I-link sa paluwagan (optional)
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <PressableScale onPress={() => setCircleId(null)}>
          <Chip label="Wala" tone={circleId === null ? 'ink' : 'neutral'} />
        </PressableScale>
        {(circles.data ?? []).map((mc) => (
          <PressableScale key={mc.circle.id} onPress={() => setCircleId(mc.circle.id)}>
            <Chip label={`${mc.circle.emoji} ${mc.circle.name}`} tone={circleId === mc.circle.id ? 'ink' : 'neutral'} />
          </PressableScale>
        ))}
      </View>
      <Button title="I-save" onPress={submit} loading={save.isPending} disabled={!title.trim() || !(Number(target) > 0)} />
      {goal && (
        <Button
          title="Burahin"
          variant="danger"
          onPress={() => del.mutate(goal.id, { onSuccess: onClose })}
          loading={del.isPending}
        />
      )}
    </Sheet>
  );
}
