import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { parseDate, toISODate, todayISO } from '@/lib/format';
import { useColors } from '@/lib/prefs';

const MONTHS = ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'];
const DAYS = ['L', 'L', 'M', 'M', 'H', 'B', 'S'];

export function MonthCalendar({
  value,
  onChange,
  highlight,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Optional predicate to emphasise suggested dates (e.g. paydays). */
  highlight?: (d: Date) => boolean;
}) {
  const c = useColors();
  const sel = parseDate(value);
  const [cursor, setCursor] = useState(new Date(sel.getFullYear(), sel.getMonth(), 1));
  const today = todayISO();
  const firstDow = cursor.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <IconButton icon="chevron-left" size={36} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
        <Text variant="h3">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </Text>
        <IconButton icon="chevron-right" size={36} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
      </View>
      <View style={styles.grid}>
        {DAYS.map((d, i) => (
          <View key={i} style={styles.cell}>
            <Text variant="caption" tone="faint">
              {d}
            </Text>
          </View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const iso = toISODate(d);
          const past = iso < today;
          const selected = iso === value;
          const hl = !past && highlight?.(d);
          return (
            <View key={i} style={styles.cell}>
              <PressableScale
                disabled={past}
                onPress={() => onChange(iso)}
                style={[
                  styles.day,
                  selected && { backgroundColor: c.ink },
                  !selected && hl && { backgroundColor: c.accent },
                ]}>
                <Text
                  variant="smallBold"
                  color={selected ? c.onInk : hl ? c.accentInk : past ? c.textFaint : c.text}>
                  {d.getDate()}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: '84%', height: '84%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
