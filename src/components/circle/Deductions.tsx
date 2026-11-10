import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { confirmAction } from '@/lib/alert';
import { peso, shortDate } from '@/lib/format';
import { useColors } from '@/lib/prefs';

/** Record money taken out of what's been collected (online and offline). */
export function DeductionSheet({
  open,
  onClose,
  collected,
  loading,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** What's been collected so far, to show what's left. */
  collected: number;
  loading?: boolean;
  onConfirm: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount('');
      setReason('');
    }
  }
  const n = Number(amount) || 0;
  const ok = n > 0 && reason.trim().length > 0;
  return (
    <Sheet open={open} onClose={onClose} title="Record a deduction" subtitle="Money taken out of what’s been collected, so the records match what you actually have.">
      <Input label="Amount taken out" prefix="₱" placeholder="0" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" autoFocus />
      <Input label="What was it for?" placeholder="e.g. Transfer fee, lent to a member, lost cash" value={reason} onChangeText={setReason} maxLength={200} />
      {n > 0 && (
        <Text variant="small" tone={n > collected ? 'warning' : 'muted'}>
          {peso(collected)} collected → {peso(collected - n)} left{n > collected ? ' (more than what’s been collected)' : ''}. Every member sees this in Activity.
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" full={false} style={{ flex: 1 }} onPress={onClose} />
        <Button title={n > 0 ? `Deduct ${peso(n)}` : 'Deduct'} icon="minus-circle" full={false} style={{ flex: 1.4 }} disabled={!ok} loading={loading} onPress={() => onConfirm(n, reason.trim())} />
      </View>
    </Sheet>
  );
}

export type AdjustmentRow = { id: string; kind: 'deduction' | 'refund'; amount: number; reason: string; at: string; who?: string };

/** "Less: ..." lines under the collected amount. The admin can remove a deduction. */
export function AdjustmentLines({ rows, onRemove }: { rows: AdjustmentRow[]; onRemove?: (row: AdjustmentRow) => void }) {
  const c = useColors();
  if (!rows.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name={r.kind === 'refund' ? 'corner-up-left' : 'minus-circle'} size={14} color={c.warning} />
          <Text variant="small" tone="muted" style={{ flex: 1 }} numberOfLines={2}>
            {r.kind === 'refund' ? `Refund${r.who ? ` to ${r.who}` : ''}` : r.reason} · {shortDate(r.at.slice(0, 10))}
          </Text>
          <Text variant="smallBold" tone="warning" style={{ fontVariant: ['tabular-nums'] }}>
            −{peso(r.amount)}
          </Text>
          {onRemove && r.kind === 'deduction' && (
            <PressableScale
              hitSlop={8}
              onPress={() => confirmAction('Remove this deduction?', `${peso(r.amount)} for “${r.reason}” goes back into the collected total.`, () => onRemove(r), { confirmText: 'Remove' })}
              accessibilityLabel="Remove deduction">
              <Feather name="x" size={14} color={c.textFaint} />
            </PressableScale>
          )}
        </View>
      ))}
    </View>
  );
}
