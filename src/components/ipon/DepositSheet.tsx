import { useState } from 'react';
import { View } from 'react-native';

import { Chip, Input, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { useAddDeposit } from '@/lib/api';
import { notifyError } from '@/lib/alert';
import { peso } from '@/lib/format';
import type { Goal } from '@/lib/types';

type Kind = 'deposit' | 'withdraw';

/** Log money put into (or taken out of) an ipon goal. */
export function DepositSheet({ open, onClose, goal, initial = 'deposit', onSaved }: { open: boolean; onClose: () => void; goal: Goal; initial?: Kind; onSaved?: (amount: number) => void }) {
  const add = useAddDeposit();
  const [kind, setKind] = useState<Kind>(initial);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(initial);
      setAmount(goal.plan_amount ? String(goal.plan_amount) : '');
      setNote('');
    }
  }

  const n = Number(amount);
  const quick = [goal.plan_amount ? Number(goal.plan_amount) : null, 100, 500, 1000].filter((x, i, a): x is number => !!x && a.indexOf(x) === i);
  const submit = () => {
    const signed = kind === 'deposit' ? n : -n;
    add.mutate(
      { goal_id: goal.id, amount: signed, note },
      {
        onSuccess: () => {
          haptic('success');
          onSaved?.(signed);
          onClose();
        },
        onError: (e) => notifyError(e, 'Couldn’t save'),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={goal.title} subtitle="Log money you set aside (or took out).">
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'deposit', label: 'Add ipon' },
          { value: 'withdraw', label: 'Withdraw' },
        ]}
      />
      <Input label="Amount" prefix="₱" placeholder="500" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" autoFocus />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {quick.map((q) => (
          <PressableScale key={q} hapticOnPress={false} onPress={() => setAmount(String(q))}>
            <Chip label={peso(q)} tone={n === q ? 'ink' : 'neutral'} />
          </PressableScale>
        ))}
      </View>
      <Input label="Note (optional)" placeholder={kind === 'deposit' ? 'e.g. Payday ipon' : 'e.g. Emergency'} value={note} onChangeText={setNote} maxLength={120} />
      <Button
        title={kind === 'deposit' ? `Add ${n > 0 ? peso(n) : 'ipon'}` : `Withdraw ${n > 0 ? peso(n) : ''}`.trim()}
        variant={kind === 'deposit' ? 'brand' : 'secondary'}
        icon={kind === 'deposit' ? 'plus' : 'minus'}
        onPress={submit}
        loading={add.isPending}
        disabled={!(n > 0)}
      />
    </Sheet>
  );
}
