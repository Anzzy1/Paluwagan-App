import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCircleAction } from '@/lib/api';
import { daysUntil, longDate, parseDate, todayISO, toISODate } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Round } from '@/lib/types';
import { radius } from '@/theme/tokens';

const plusDays = (d: string, n: number) => {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toISODate(x);
};

/** Online paluwagan: move the current sahod later (same as the offline Delay sahod). */
export function DelaySahodSheet({ open, onClose, circleId, round, next }: { open: boolean; onClose: () => void; circleId: string; round: Round; next?: Round }) {
  const c = useColors();
  const action = useCircleAction(circleId);
  const base = round.due_date < todayISO() ? todayISO() : round.due_date;
  const [date, setDate] = useState(plusDays(base, 1));
  const [shiftLater, setShiftLater] = useState(true);
  const days = daysUntil(date) - daysUntil(round.due_date);
  const tooEarly = date <= round.due_date;
  const passesNext = !shiftLater && !!next && date >= next.due_date;

  const save = () =>
    action.mutate(
      { fn: 'delay_sahod', args: { p_circle: circleId, p_new_date: date, p_shift_later: shiftLater } },
      {
        onSuccess: () => {
          haptic('light');
          onClose();
        },
        onError: (e) => notifyError(e, 'Couldn’t move the sahod'),
      },
    );

  return (
    <Sheet open={open} onClose={onClose} title="Delay sahod" subtitle={`Round ${round.round_no}’s sahod is on ${longDate(round.due_date)}. Pick a new date.`}>
      <View style={styles.wrapRow}>
        {[1, 3, 7].map((n) => {
          const d = plusDays(base, n);
          return (
            <PressableScale key={n} hapticOnPress={false} onPress={() => setDate(d)}>
              <Chip label={`+${n} day${n === 1 ? '' : 's'}`} tone={date === d ? 'ink' : 'neutral'} />
            </PressableScale>
          );
        })}
      </View>
      <Card>
        <MonthCalendar value={date} onChange={setDate} />
      </Card>
      <PressableScale hapticOnPress={false} onPress={() => setShiftLater(!shiftLater)} style={[styles.toggle, { backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.check, { backgroundColor: shiftLater ? c.brand : c.surface, borderColor: shiftLater ? c.brand : c.borderStrong }]}>
          {shiftLater && <Feather name="check" size={14} color="#fff" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="smallBold">Move the sahod after this too</Text>
          <Text variant="caption" tone="muted">
            Keeps the same order and spacing. Hulog dates don’t change.
          </Text>
        </View>
      </PressableScale>
      {tooEarly ? (
        <Text variant="small" tone="danger">
          Pick a date after {longDate(round.due_date)}.
        </Text>
      ) : passesNext ? (
        <Text variant="small" tone="danger">
          That’s on or after the next sahod ({longDate(next!.due_date)}). Turn on “Move the sahod after this too” to keep the order.
        </Text>
      ) : (
        <Text variant="small" tone="muted">
          Moves {days} day{days === 1 ? '' : 's'} later, to {longDate(date)}. Members see it in Activity.
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" full={false} style={{ flex: 1 }} onPress={onClose} />
        <Button title="Delay sahod" icon="clock" full={false} style={{ flex: 1.4 }} disabled={tooEarly || passesNext} loading={action.isPending} onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
