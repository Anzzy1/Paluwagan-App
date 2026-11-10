import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { longDate, parseDate, peso, shortDate, todayISO, toISODate } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

const plusDays = (d: string, n: number) => {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toISODate(x);
};
const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

export type AdvanceSahodProps = {
  open: boolean;
  onClose: () => void;
  /** Who gets this sahod ("you" for yourself). */
  name: string;
  /** Full sahod for this round. */
  pot: number;
  /** Hulog collected for it so far. */
  collected: number;
  /** Planned sahod date. */
  dueDate: string;
  /** Next hulog date nobody has paid yet (where hulog continues), or null if none are left. */
  anchor: string | null;
  /** Date of the last sahod, to show how far the end moves. */
  lastSahod: string | null;
  loading?: boolean;
  onConfirm: (given: number, resume: string | null) => void;
};

/**
 * Advance sahod: how much the recipient actually gets now (the rest is a balance given later)
 * and the day hulog continues (later dates move by the same number of days).
 */
export function AdvanceSahodSheet(p: AdvanceSahodProps) {
  const c = useColors();
  const [amount, setAmount] = useState('');
  const [resume, setResume] = useState<string | null>(p.anchor);
  const [pick, setPick] = useState(false);

  // Fresh values each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (p.open !== wasOpen) {
    setWasOpen(p.open);
    if (p.open) {
      setAmount(p.collected > 0 ? String(p.collected) : '');
      setResume(p.anchor);
      setPick(false);
    }
  }

  const given = Number(amount) || 0;
  const balance = Math.max(0, p.pot - given);
  const fronted = Math.max(0, given - p.collected);
  const tooMuch = given > p.pot;
  const shift = p.anchor && resume ? daysBetween(p.anchor, resume) : 0;
  const tooEarly = shift < 0;
  const ok = given > 0 && !tooMuch && !tooEarly;

  const today = todayISO();
  const tomorrow = plusDays(today, 1);
  const label = (d: string) => (d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : shortDate(d));
  const choices = p.anchor ? [p.anchor, ...[1, 3, 7].map((n) => plusDays(p.anchor!, n))] : [];

  return (
    <Sheet open={p.open} onClose={p.onClose} title="Advance sahod" subtitle={`Give ${p.name}’s sahod before ${longDate(p.dueDate)}.`}>
      <View style={{ gap: 8 }}>
        <Input
          label={`How much did ${p.name} get?`}
          prefix="₱"
          placeholder={String(p.pot)}
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
        />
        <View style={styles.wrapRow}>
          {p.collected > 0 && p.collected < p.pot && (
            <PressableScale hapticOnPress={false} onPress={() => setAmount(String(p.collected))}>
              <Chip label={`Collected so far · ${peso(p.collected)}`} tone={given === p.collected ? 'ink' : 'neutral'} />
            </PressableScale>
          )}
          <PressableScale hapticOnPress={false} onPress={() => setAmount(String(p.pot))}>
            <Chip label={`Full sahod · ${peso(p.pot)}`} tone={given === p.pot ? 'ink' : 'neutral'} />
          </PressableScale>
        </View>
      </View>

      {p.anchor && (
        <View style={{ gap: 8 }}>
          <Text variant="smallBold">When does hulog continue?</Text>
          <View style={styles.wrapRow}>
            {choices.map((d, i) => (
              <PressableScale
                key={d}
                hapticOnPress={false}
                onPress={() => {
                  setResume(d);
                  setPick(false);
                }}>
                <Chip label={i === 0 ? `As scheduled · ${label(d)}` : label(d)} tone={resume === d && !pick ? 'ink' : 'neutral'} />
              </PressableScale>
            ))}
            <PressableScale hapticOnPress={false} onPress={() => setPick(!pick)}>
              <Chip label="Pick a date" icon="calendar" tone={pick ? 'ink' : 'neutral'} />
            </PressableScale>
          </View>
          {pick && (
            <Card>
              <MonthCalendar value={resume ?? p.anchor} onChange={setResume} />
            </Card>
          )}
        </View>
      )}

      {/* The math, so nobody loses track of what's owed. */}
      <View style={[styles.sum, { backgroundColor: c.surfaceAlt }]}>
        <Line label={`Sahod for ${p.name}`} value={peso(p.pot)} />
        <Line label="Collected so far" value={peso(p.collected)} />
        <Line label="Given now" value={peso(given)} strong />
        {balance > 0 && given > 0 && (
          <Line label={`Balance still owed to ${p.name}`} value={peso(balance)} tone="warning" note="Give it once the rest of this sahod’s hulog is in. It stays on the paluwagan screen until then." />
        )}
        {fronted > 0 && !tooMuch && (
          <Line label="Not collected yet (fronted)" value={peso(fronted)} tone="warning" note="Whoever handed over the extra gets it back from the hulog still coming in for this sahod." />
        )}
        {p.anchor && resume && shift > 0 && (
          <Line
            label={`Hulog stops for ${shift} day${shift === 1 ? '' : 's'}`}
            value={`from ${shortDate(p.anchor)}`}
            note={`Hulog continues ${longDate(resume)}. Every hulog after that and every later sahod moves ${shift} day${shift === 1 ? '' : 's'}${
              p.lastSahod ? `; the last sahod moves from ${shortDate(p.lastSahod)} to ${shortDate(plusDays(p.lastSahod, shift))}` : ''
            }.`}
          />
        )}
        {p.anchor && resume && shift === 0 && <Line label="Hulog continues" value={longDate(resume)} note="No dates change." />}
      </View>

      {tooMuch ? (
        <Text variant="small" tone="danger">
          That’s more than the full sahod ({peso(p.pot)}).
        </Text>
      ) : tooEarly ? (
        <Text variant="small" tone="danger">
          Hulog can continue on {longDate(p.anchor!)} at the earliest.
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" full={false} style={{ flex: 1 }} onPress={p.onClose} />
        <Button
          title={given > 0 ? `Give ${peso(given)}` : 'Advance sahod'}
          icon="fast-forward"
          full={false}
          style={{ flex: 1.4 }}
          disabled={!ok}
          loading={p.loading}
          onPress={() => p.onConfirm(Math.min(given, p.pot), p.anchor ? resume : null)}
        />
      </View>
    </Sheet>
  );
}

function Line({ label, value, note, tone, strong }: { label: string; value: string; note?: string; tone?: 'warning'; strong?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <Text variant={strong ? 'smallBold' : 'small'} tone={tone ?? (strong ? undefined : 'muted')} style={{ flex: 1 }}>
          {label}
        </Text>
        <Text variant="smallBold" tone={tone} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </View>
      {note && (
        <Text variant="caption" tone="faint">
          {note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sum: { gap: 10, padding: 14, borderRadius: radius.md },
});
