import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip, Input, PurposeIcon, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useDeleteGoal, useMyCircles, useSaveGoal } from '@/lib/api';
import { confirmAction, notifyError } from '@/lib/alert';
import { daysUntil, longDate, peso, toISODate } from '@/lib/format';
import { planLabel, planPer } from '@/lib/ipon';
import { useColors } from '@/lib/prefs';
import type { Goal, PlanFrequency } from '@/lib/types';
import { circleIcons, iconChoices, radius } from '@/theme/tokens';

const FREQS: PlanFrequency[] = ['daily', 'weekly', 'kinsenas', 'monthly'];
const DAYS_PER: Record<PlanFrequency, number> = { daily: 1, weekly: 7, kinsenas: 15.2, monthly: 30.4 };

const inMonths = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
};

/** Create or edit an ipon goal: name, target, optional target date + savings plan, optional circle link. */
export function GoalSheet({
  open,
  onClose,
  goal,
  saved = 0,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  goal?: Goal | null;
  /** Already saved toward this goal, so the suggested plan covers only what's left. */
  saved?: number;
  onDeleted?: () => void;
}) {
  const c = useColors();
  const circles = useMyCircles();
  const save = useSaveGoal();
  const del = useDeleteGoal();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [icon, setIcon] = useState<string>('star');
  const [circleId, setCircleId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState(false);
  const [freq, setFreq] = useState<PlanFrequency>('weekly');
  const [plan, setPlan] = useState('');

  // Reset the form each time the sheet opens (state adjustment during render).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(goal?.title ?? '');
      setTarget(goal ? String(goal.target) : '');
      setIcon(goal?.emoji && goal.emoji in Feather.glyphMap ? goal.emoji : 'star');
      setCircleId(goal?.circle_id ?? null);
      setDeadline(goal?.deadline ?? null);
      setPickDate(false);
      setFreq(goal?.plan_frequency ?? 'weekly');
      setPlan(goal?.plan_amount ? String(goal.plan_amount) : '');
    }
  }

  // Suggested amount per period to reach the target by the chosen date.
  const t = Number(target);
  const days = deadline ? Math.max(1, daysUntil(deadline)) : 0;
  const left = Math.max(0, t - saved);
  const suggested = deadline && left > 0 ? Math.ceil(left / Math.max(1, Math.ceil(days / DAYS_PER[freq])) / 10) * 10 : null;

  const fail = (e: unknown) => notifyError(e, 'Couldn’t save');
  const submit = () =>
    save.mutate(
      {
        id: goal?.id,
        title: title.trim(),
        target: t,
        emoji: icon,
        circle_id: circleId,
        deadline,
        plan_amount: Number(plan) > 0 ? Number(plan) : null,
        plan_frequency: Number(plan) > 0 ? freq : null,
      },
      { onSuccess: onClose, onError: fail },
    );
  const remove = () =>
    goal &&
    confirmAction('Delete this goal?', 'Its deposit history will be deleted too.', () => del.mutate(goal.id, { onSuccess: () => (onClose(), onDeleted?.()), onError: fail }), {
      confirmText: 'Delete',
      destructive: true,
    });

  return (
    <Sheet open={open} onClose={onClose} title={goal ? 'Edit ipon goal' : 'New ipon goal'} subtitle="Save on your own, at your own pace.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {circleIcons.map((name) => (
          <PressableScale
            key={name}
            hapticOnPress={false}
            onPress={() => setIcon(name)}
            accessibilityLabel={iconChoices.find((x) => x.icon === name)?.label}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.sm + 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: name === icon ? c.brand : c.brandSoft,
            }}>
            <PurposeIcon icon={name} size={21} color={name === icon ? c.onBrand : c.brandText} />
          </PressableScale>
        ))}
      </View>
      <Input label="What are you saving for?" placeholder="e.g. Emergency fund, Tuition, New phone" value={title} onChangeText={setTitle} maxLength={60} />
      <Input label="Target amount" prefix="₱" placeholder="20,000" value={target} onChangeText={(v) => setTarget(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />

      {/* target date */}
      <View style={{ gap: 8 }}>
        <Text variant="smallBold">Target date (optional)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[3, 6, 12].map((m) => {
            const iso = inMonths(m);
            return (
              <PressableScale key={m} hapticOnPress={false} onPress={() => (setDeadline(iso), setPickDate(false))}>
                <Chip label={`${m} months`} tone={deadline === iso ? 'ink' : 'neutral'} />
              </PressableScale>
            );
          })}
          <PressableScale hapticOnPress={false} onPress={() => (setPickDate((v) => !v), setDeadline((d) => d ?? inMonths(6)))}>
            <Chip label={deadline ? longDate(deadline) : 'Pick a date'} icon="calendar" tone={pickDate ? 'ink' : 'neutral'} />
          </PressableScale>
          {deadline && (
            <PressableScale hapticOnPress={false} onPress={() => (setDeadline(null), setPickDate(false))}>
              <Chip label="No date" tone="neutral" />
            </PressableScale>
          )}
        </View>
        {pickDate && deadline && <MonthCalendar value={deadline} onChange={setDeadline} />}
      </View>

      {/* savings plan */}
      <View style={{ gap: 8 }}>
        <Text variant="smallBold">Savings plan (optional)</Text>
        <Segmented value={freq} onChange={setFreq} options={FREQS.map((f) => ({ value: f, label: planLabel[f] }))} />
        <Input
          prefix="₱"
          placeholder={suggested ? String(suggested) : '500'}
          value={plan}
          onChangeText={(v) => setPlan(v.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          hint={suggested ? `To reach ${peso(t)}${saved > 0 ? ` (${peso(left)} to go)` : ''} by ${longDate(deadline!)}, save about ${peso(suggested)} ${planPer[freq]}.` : `How much you'll set aside ${planPer[freq]}.`}
        />
        {suggested && Number(plan) !== suggested && (
          <PressableScale hapticOnPress={false} onPress={() => setPlan(String(suggested))} style={{ alignSelf: 'flex-start' }}>
            <Chip label={`Use ${peso(suggested)}`} icon="check" tone="brand" />
          </PressableScale>
        )}
      </View>

      <Text variant="smallBold">Link to a paluwagan (optional)</Text>
      <Text variant="small" tone="faint" style={{ marginTop: -6 }}>
        What you pay into the paluwagan counts toward this goal.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <PressableScale hapticOnPress={false} onPress={() => setCircleId(null)}>
          <Chip label="None" tone={circleId === null ? 'ink' : 'neutral'} />
        </PressableScale>
        {(circles.data ?? []).map((mc) => (
          <PressableScale key={mc.circle.id} hapticOnPress={false} onPress={() => setCircleId(mc.circle.id)}>
            <Chip label={mc.circle.name} tone={circleId === mc.circle.id ? 'ink' : 'neutral'} />
          </PressableScale>
        ))}
      </View>
      <Button title="Save goal" onPress={submit} loading={save.isPending} disabled={!title.trim() || !(t > 0)} />
      {goal && <Button title="Delete goal" variant="danger" onPress={remove} loading={del.isPending} />}
    </Sheet>
  );
}
