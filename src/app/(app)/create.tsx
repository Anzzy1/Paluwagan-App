import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useRequireAccount } from '@/components/AccountGate';
import { Avatar, Chip, CircleIcon, IconButton, type IconName, Input, Notice, ProgressBar, PurposeIcon } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCreateCircle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { createManagedCircle, evenPayout, payoutPlan, roundDueDate, type PayoutSchedule } from '@/lib/local';
import { longDate, looksLikeScam, payoutShort, peso, scheduleLabel, scheduleShort, shortDate, todayISO, toISODate } from '@/lib/format';
import { useColors, useIsDesktop } from '@/lib/prefs';
import type { Frequency } from '@/lib/types';
import { circleIcons, circleTints, font, iconChoices, radius, tintNames, type CircleTint } from '@/theme/tokens';

/** Smallest paluwagan (online and managed). */
const MIN_MEMBERS = 3;

const DEFAULT_RULES = [
  '1. Contributions are due on or before each due date. Upload proof of payment in the app.',
  '2. The payout recipient confirms each payment once received.',
  '3. Members who have received their payout must continue contributing until the paluwagan ends.',
  '4. Turn swaps require consent from both members and approval from the admin.',
].join('\n');

function nextSemiMonthly(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const fifteenth = new Date(y, m, 15);
  const eom = new Date(y, m + 1, 0);
  if (d <= fifteenth) return toISODate(fifteenth);
  if (d <= eom) return toISODate(eom);
  return toISODate(new Date(y, m + 1, 15));
}

const STEPS = ['Type', 'Details', 'Contribution', 'Hulog', 'Sahod', 'Rules & security'];

function Stepper({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <View style={styles.stepperCtl}>
      <IconButton icon="minus" size={44} onPress={() => onChange(Math.max(min, value - 1))} label="Decrease" />
      <Text variant="h2" style={{ minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <IconButton icon="plus" size={44} onPress={() => onChange(Math.min(max, value + 1))} label="Increase" />
    </View>
  );
}

function ChoiceCard({ selected, icon, title, body, onPress }: { selected: boolean; icon: 'shuffle' | 'list'; title: string; body: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      hapticOnPress={false}
      style={[styles.option, { backgroundColor: c.surface, borderColor: selected ? c.brand : c.border, borderWidth: selected ? 2 : 1 }]}>
      <View style={[styles.optionIcon, { backgroundColor: selected ? c.brandSoft : c.surfaceAlt }]}>
        <Feather name={icon} size={18} color={selected ? c.brand : c.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
      <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? c.brand : c.borderStrong} />
    </PressableScale>
  );
}

function TypeCard({ selected, icon, title, body, onPress }: { selected: boolean; icon: IconName; title: string; body: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      hapticOnPress={false}
      style={[styles.option, { backgroundColor: selected ? c.brandSoft : c.surface, borderColor: selected ? c.brand : c.border, borderWidth: 2 }]}>
      <View style={[styles.optionIcon, { width: 48, height: 48, borderRadius: 16, backgroundColor: selected ? c.brand : c.surfaceAlt }]}>
        <Feather name={icon} size={22} color={selected ? c.onBrand : c.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
      <Feather name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? c.brand : c.borderStrong} />
    </PressableScale>
  );
}

const SCHEDULES: { value: Frequency; icon: IconName; title: string; sub: string }[] = [
  { value: 'daily', icon: 'sun', title: 'Daily', sub: 'Every day' },
  { value: 'weekly', icon: 'calendar', title: 'Weekly', sub: 'Every 7 days' },
  { value: 'kinsenas', icon: 'credit-card', title: 'Payday', sub: '15th & 30th' },
  { value: 'monthly', icon: 'repeat', title: 'Monthly', sub: 'Same date' },
  { value: 'custom', icon: 'sliders', title: 'Custom', sub: 'Every N days' },
];

type SahodMode = 'same' | 'weekly' | 'kinsenas' | 'monthly' | 'custom';
const SAHOD: { value: SahodMode; icon: IconName; title: string; sub: string }[] = [
  { value: 'same', icon: 'zap', title: 'Every hulog', sub: 'Pot goes out each time' },
  { value: 'weekly', icon: 'calendar', title: 'Weekly', sub: 'Every 7 days' },
  { value: 'kinsenas', icon: 'credit-card', title: 'Kinsenas', sub: '15th & 30th' },
  { value: 'monthly', icon: 'repeat', title: 'Monthly', sub: 'Same date' },
  { value: 'custom', icon: 'sliders', title: 'Custom', sub: 'Every N days' },
];

/** Labelled icon grid; the selected tile takes the circle's colour. */
function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: CircleTint }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const t = useTint(color);
  return (
    <View style={styles.wrap}>
      {iconChoices.map(({ icon, label }) => {
        const on = icon === value;
        return (
          <PressableScale
            key={icon}
            hapticOnPress={false}
            onPress={() => onChange(icon)}
            accessibilityLabel={label}
            style={[styles.iconTile, { flexBasis: desktop ? '18%' : '22%', backgroundColor: on ? t.soft : 'transparent', borderColor: on ? t.strong : 'transparent' }]}>
            <View style={[styles.iconBubble, { backgroundColor: on ? t.strong : t.soft }]}>
              <PurposeIcon icon={icon} size={21} color={on ? '#fff' : t.strong} />
            </View>
            <Text variant="caption" numberOfLines={1} color={on ? t.strong : c.textMuted} style={on ? { fontWeight: '700' } : undefined}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Live preview of the circle card while choosing name, icon and colour. */
function CirclePreview({ name, icon, color, sub }: { name: string; icon: string; color: CircleTint; sub: string }) {
  const t = useTint(color);
  return (
    <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
      <View style={styles.previewDeco} />
      <View style={styles.previewIcon}>
        <PurposeIcon icon={icon} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h2" color="#fff" numberOfLines={1}>
          {name.trim() || 'Your paluwagan'}
        </Text>
        <Text variant="small" color="rgba(255,255,255,0.85)">
          {sub}
        </Text>
      </View>
    </LinearGradient>
  );
}

const PRESETS = [500, 1000, 2000, 2500];

/** Contribution amount: big editable number, ±₱100 buttons and large preset tiles. */
function AmountPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  const n = Number(value) || 0;
  const bump = (d: number) => onChange(String(Math.max(0, n + d)));
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <Text variant="h3">Contribution per slot</Text>
        <Text variant="small" tone="muted">
          How much each member pays every round.
        </Text>
      </View>
      <View style={[styles.amountRow, { backgroundColor: c.surfaceAlt }]}>
        <PressableScale onPress={() => bump(-100)} disabled={n <= 100} accessibilityLabel="Less ₱100" style={[styles.bump, { backgroundColor: c.surface, opacity: n <= 100 ? 0.4 : 1 }]}>
          <Feather name="minus" size={22} color={c.text} />
        </PressableScale>
        <View style={styles.amountMid}>
          <Text style={[styles.peso, { color: c.textMuted }]}>₱</Text>
          <TextInput
            value={value}
            onChangeText={(v) => onChange(v.replace(/[^\d]/g, '').slice(0, 7))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={c.textFaint}
            accessibilityLabel="Contribution amount"
            style={[styles.amountInput, { color: c.text, width: Math.max(1, value.length) * 26 + 10 }, { outlineStyle: 'none' } as never]}
          />
        </View>
        <PressableScale onPress={() => bump(100)} accessibilityLabel="Add ₱100" style={[styles.bump, { backgroundColor: c.surface }]}>
          <Feather name="plus" size={22} color={c.text} />
        </PressableScale>
      </View>
      <View style={styles.presets}>
        {PRESETS.map((v) => {
          const on = n === v;
          return (
            <PressableScale
              key={v}
              onPress={() => onChange(String(v))}
              accessibilityLabel={peso(v)}
              style={[styles.preset, { backgroundColor: on ? c.brand : c.surface, borderColor: on ? c.brand : c.border }]}>
              <Text variant="bodyBold" color={on ? c.onBrand : c.text} style={{ fontSize: 16 }}>
                {peso(v)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}

export default function CreateCircle() {
  const c = useColors();
  const desktop = useIsDesktop();
  const create = useCreateCircle();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(circleIcons[0]);
  const [color, setColor] = useState<CircleTint>('leaf');
  const [amount, setAmount] = useState('1000');
  const [frequency, setFrequency] = useState<Frequency>('kinsenas');
  const [startDate, setStartDate] = useState(nextSemiMonthly());
  const [lateFee, setLateFee] = useState('0');
  const [grace, setGrace] = useState(1);
  const { isOffline } = useAuth();
  const requireAccount = useRequireAccount();
  // Offline users can only run managed paluwagan, so start there.
  const [rules, setRules] = useState(isOffline ? '' : DEFAULT_RULES);
  const [orderMode, setOrderMode] = useState<'draw' | 'manual'>('draw');
  const [intervalDays, setIntervalDays] = useState(3);
  const [sahodMode, setSahodMode] = useState<SahodMode>('same');
  const [sahodEvery, setSahodEvery] = useState(7);
  // A hand-picked first sahod, remembered with the schedule it was picked for.
  const [pickedSahod, setPickedSahod] = useState<{ key: string; date: string } | null>(null);
  const [pickSahod, setPickSahod] = useState(false);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [kind, setKind] = useState<'online' | 'managed'>(isOffline ? 'managed' : 'online');
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [newMember, setNewMember] = useState('');
  const managed = kind === 'managed';

  const amt = Number(amount) || 0;
  // Online paluwagan have no fixed size: members join with the code and the admin locks at 3+.
  const memberCount = managed ? memberNames.length : null;
  const previewCount = memberCount ?? MIN_MEMBERS;
  const scam = looksLikeScam(rules) || looksLikeScam(name);
  const interval = frequency === 'custom' ? intervalDays : null;
  const sched = { frequency, interval_days: interval };
  // Sahod (payout) schedule: null means the pot goes out on every hulog date.
  // Lined up so every sahod collects the same number of hulog (monthly ≈ every 30 days, kinsenas ≈ 15).
  const hulogSched = { frequency, interval_days: interval, start_date: startDate };
  const even = sahodMode === 'same' ? null : evenPayout(hulogSched, sahodMode, sahodMode === 'custom' ? sahodEvery : null);
  // Changing the hulog or sahod schedule drops a hand-picked date, so it never goes stale.
  const schedKey = `${frequency}|${interval}|${startDate}|${sahodMode}|${sahodEvery}`;
  const firstSahod = pickedSahod?.key === schedKey ? pickedSahod.date : null;
  const payout: PayoutSchedule = even ? { frequency: even.frequency, interval_days: even.interval_days, first_date: firstSahod ?? even.first_date } : null;
  /** What a sahod tile means for the chosen hulog schedule, e.g. "Every 30 days". */
  const sahodSub = (mode: SahodMode, fallback: string) => {
    if (mode === 'same') return fallback;
    const d = evenPayout(hulogSched, mode, mode === 'custom' ? sahodEvery : null).days;
    if (!d || mode === 'custom') return fallback;
    return d % 7 === 0 && d > 7 ? `Every ${d / 7} weeks` : `Every ${d} days`;
  };
  const plan = payoutPlan(hulogSched, payout, Math.max(MIN_MEMBERS, previewCount));
  const perSahod = plan[0]?.dates.length ?? 1;
  const varies = new Set(plan.map((x) => x.dates.length)).size > 1;
  /** What one member puts into each sahod; the pot is this × the number of members. */
  const perMember = amt * perSahod;
  const pot = memberCount != null ? perMember * memberCount : null;
  const firstHulog = roundDueDate(frequency, startDate, 1, interval);
  const sahodValid = !payout || payout.first_date >= firstHulog;
  const canNext = [true, name.trim().length > 0, amt > 0 && (!managed || memberNames.length >= MIN_MEMBERS), !!startDate, sahodValid, managed || password.length >= 4][step];
  const last = step === STEPS.length - 1;

  const addName = () => {
    const n = newMember.trim();
    if (!n) return;
    setMemberNames((prev) => [...prev, n]);
    setNewMember('');
  };

  const submitManaged = () => {
    const id = createManagedCircle({
      name: name.trim(),
      emoji: icon,
      color,
      amount: amt,
      frequency,
      interval_days: interval,
      start_date: startDate,
      payout,
      late_fee: Number(lateFee) || 0,
      grace_days: grace,
      notes: rules.trim(),
      memberNames,
    });
    router.replace(`/managed/${id}` as Href);
  };

  const submit = () =>
    managed ? submitManaged() : create.mutate(
      {
        name: name.trim(),
        emoji: icon,
        color,
        amount: amt,
        // Grows as members join; fixed when the admin locks it (migration 0010).
        slots: 50,
        frequency,
        start_date: startDate,
        late_fee: Number(lateFee) || 0,
        grace_days: grace,
        rules: rules.trim(),
        order_mode: orderMode,
        interval_days: interval,
        payout_frequency: payout?.frequency ?? null,
        payout_interval_days: payout?.interval_days ?? null,
        first_payout_date: payout?.first_date ?? null,
        password,
      },
      { onSuccess: (id) => router.replace(`/circle/${id}`), onError: (e) => notifyError(e, 'Couldn’t create paluwagan') },
    );

  const footer = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {step > 0 && <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />}
      <Button
        title={last ? (managed ? 'Create managed paluwagan' : 'Create paluwagan') : 'Continue'}
        iconRight={last ? undefined : 'arrow-right'}
        onPress={() => (last ? submit() : setStep(step + 1))}
        disabled={!canNext}
        loading={create.isPending}
        style={{ flex: 2 }}
      />
    </View>
  );

  const summary = (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircleIcon icon={icon} color={color} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {name || 'Untitled paluwagan'}
          </Text>
          <Text variant="small" tone="muted">
            {managed ? `${memberNames.length} members` : `Open to members · min ${MIN_MEMBERS}`} · {payoutShort({ ...sched, payout })}
          </Text>
        </View>
      </View>
      <View style={styles.sumRow}>
        <Text tone="muted">Contribution</Text>
        <Text variant="money">{peso(amt)}</Text>
      </View>
      <View style={styles.sumRow}>
        <Text tone="muted">Per sahod</Text>
        <Text variant="money">
          {varies ? '≈ ' : ''}
          {pot != null ? peso(pot) : `${peso(perMember)} × members`}
        </Text>
      </View>
      <View style={styles.sumRow}>
        <Text tone="muted">First hulog</Text>
        <Text variant="bodyMedium">{longDate(firstHulog)}</Text>
      </View>
      <View style={styles.sumRow}>
        <Text tone="muted">First sahod</Text>
        <Text variant="bodyMedium">{longDate(plan[0]?.payout_date ?? firstHulog)}</Text>
      </View>
      <View style={styles.sumRow}>
        <Text tone="muted">Type</Text>
        <Text variant="bodyMedium">{managed ? 'Managed by me' : 'Online'}</Text>
      </View>
    </Card>
  );

  const form = (
    <Animated.View key={step} entering={FadeIn.duration(220)} style={{ gap: 18 }}>
      {step === 0 && (
        <>
          <Text variant="h2">How will this paluwagan run?</Text>
          <TypeCard
            selected={!managed}
            icon="wifi"
            title="Online paluwagan"
            body={`Every member uses the app. They join with an invite code, upload receipts and confirm payments themselves.${isOffline ? ' Needs an account.' : ''}`}
            onPress={() =>
              requireAccount(() => {
                setKind('online');
                if (!rules.trim()) setRules(DEFAULT_RULES);
              }, 'Online paluwagan')
            }
          />
          <TypeCard
            selected={managed}
            icon="smartphone"
            title="Managed by me (offline)"
            body="Only you need the app. Add members by name, run a fun draw, and track who has paid and whose payout it is. Saved on this device."
            onPress={() => {
              setKind('managed');
              if (rules === DEFAULT_RULES) setRules('');
            }}
          />
        </>
      )}

      {step === 1 && (
        <>
          <CirclePreview name={name} icon={icon} color={color} sub={`${peso(amt)} · ${scheduleShort(sched)}`} />
          <Input label="Paluwagan name" placeholder="e.g. Team Savings 2026" value={name} onChangeText={setName} maxLength={40} autoFocus />
          <View style={{ gap: 8 }}>
            <Text variant="smallBold">What is this paluwagan for?</Text>
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="smallBold">Colour</Text>
            <View style={styles.wrap}>
              {tintNames.map((t) => (
                <PressableScale
                  key={t}
                  hapticOnPress={false}
                  onPress={() => setColor(t)}
                  accessibilityLabel={circleTints[t].name}
                  style={[styles.swatch, { borderColor: t === color ? c.ink : 'transparent' }]}>
                  <View style={[styles.swatchInner, { backgroundColor: circleTints[t].strong }]} />
                </PressableScale>
              ))}
            </View>
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <AmountPicker value={amount} onChange={setAmount} />
          {managed ? (
            <Card padded={false}>
              <View style={{ padding: 16, gap: 2 }}>
                <Text variant="bodyBold">Members ({memberNames.length})</Text>
                <Text variant="small" tone="muted">
                  Add everyone in the paluwagan, including yourself if you’re joining. One payout round per member.
                </Text>
              </View>
              {memberNames.map((n, i) => (
                <View key={`${n}-${i}`} style={[styles.memberRow, { borderTopColor: c.border }]}>
                  <Avatar name={n} size={32} />
                  <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                    {n}
                  </Text>
                  <IconButton icon="x" size={30} onPress={() => setMemberNames((prev) => prev.filter((_, j) => j !== i))} label={`Remove ${n}`} />
                </View>
              ))}
              <View style={[styles.memberRow, { borderTopColor: c.border }]}>
                <TextInput
                  value={newMember}
                  onChangeText={setNewMember}
                  onSubmitEditing={addName}
                  placeholder="Type a name and press Add"
                  placeholderTextColor={c.textFaint}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  style={[styles.memberInput, { color: c.text, backgroundColor: c.surfaceAlt }, { outlineStyle: 'none' } as never]}
                />
                <Button title="Add" icon="plus" size="sm" full={false} onPress={addName} disabled={!newMember.trim()} />
              </View>
            </Card>
          ) : (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.iconBubble, { backgroundColor: c.brandSoft }]}>
                <Feather name="users" size={20} color={c.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyBold">No need to set the number of members</Text>
                <Text variant="small" tone="muted">
                  Members join with your invite code. Once at least {MIN_MEMBERS} have joined, lock the paluwagan to start. Each member gets one payout round.
                </Text>
              </View>
            </Card>
          )}
          <Notice
            tone="info"
            icon="info"
            title={pot != null ? `Each sahod pays out ${varies ? 'about ' : ''}${peso(pot)}` : `Each member puts in ${peso(perMember)} per sahod`}
            body={
              managed
                ? memberNames.length < MIN_MEMBERS
                  ? `Add at least ${MIN_MEMBERS} members. You can still add or remove members until you run the draw.`
                  : 'You can still add or remove members until you run the draw.'
                : `With 5 members, each sahod is ${peso(perMember * 5)}. Two members can share one slot (split slot): each contributes half and receives half of the payout.`
            }
          />
        </>
      )}

      {step === 3 && (
        <>
          <Text variant="h2">How often do members pay (hulog)?</Text>
          <View style={styles.wrap}>
            {SCHEDULES.map((o) => {
              const on = o.value === frequency;
              return (
                <PressableScale
                  key={o.value}
                  hapticOnPress={false}
                  onPress={() => {
                    setFrequency(o.value);
                    // Hulog starts right away (kinsenas: the next payday), so there is money before the first sahod.
                    setStartDate(o.value === 'kinsenas' ? nextSemiMonthly() : todayISO());
                  }}
                  style={[styles.schedTile, { flexBasis: desktop ? '18%' : '31%', backgroundColor: on ? c.brandSoft : c.surface, borderColor: on ? c.brand : 'transparent' }]}>
                  <View style={[styles.schedIcon, { backgroundColor: on ? c.brand : c.surfaceAlt }]}>
                    <Feather name={o.icon} size={17} color={on ? c.onBrand : c.textMuted} />
                  </View>
                  <Text variant="bodyBold" color={on ? c.brand : c.text}>
                    {o.title}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {o.sub}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {frequency === 'custom' && (
            <Card style={{ gap: 12 }}>
              <View style={styles.stepper}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">Pay every</Text>
                  <Text variant="small" tone="muted">
                    Days between payments
                  </Text>
                </View>
                <Stepper value={intervalDays} onChange={setIntervalDays} min={1} max={60} />
                <Text variant="bodyBold">day{intervalDays === 1 ? '' : 's'}</Text>
              </View>
              <View style={styles.wrap}>
                {[2, 3, 4, 5, 10, 14].map((n) => (
                  <PressableScale key={n} hapticOnPress={false} onPress={() => setIntervalDays(n)}>
                    <Chip label={`${n} days`} tone={intervalDays === n ? 'ink' : 'neutral'} />
                  </PressableScale>
                ))}
              </View>
            </Card>
          )}
          <View style={{ gap: 4 }}>
            <Text variant="smallBold">First hulog date</Text>
            <Text variant="small" tone="muted">
              {scheduleLabel(sched)}. Hulog comes first: each sahod is paid from what has been collected.{frequency === 'kinsenas' ? ' Highlighted dates are paydays.' : ''}
            </Text>
          </View>
          <Card>
            <MonthCalendar
              value={startDate}
              onChange={setStartDate}
              highlight={
                frequency === 'kinsenas'
                  ? (d) => d.getDate() === 15 || d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
                  : undefined
              }
            />
          </Card>
          <View style={[styles.datesRow, { backgroundColor: c.surface }]}>
            <Feather name="calendar" size={15} color={c.brand} />
            <Text variant="small" style={{ flex: 1 }}>
              <Text variant="smallBold">Payment dates: </Text>
              {Array.from({ length: Math.min(4, Math.max(MIN_MEMBERS, previewCount)) }, (_, i) => shortDate(roundDueDate(frequency, startDate, i + 1, interval))).join(', ')}
              {previewCount > 4 || !managed ? ', …' : ''}
            </Text>
          </View>
          <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Input label="Late fee" prefix="₱" value={lateFee} onChangeText={(v) => setLateFee(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="smallBold">Grace period (days)</Text>
              <Stepper value={grace} onChange={setGrace} min={0} max={30} />
            </View>
          </View>
        </>
      )}

      {step === 4 && (
        <>
          <View style={{ gap: 4 }}>
            <Text variant="h2">When is the sahod?</Text>
            <Text variant="small" tone="muted">
              How often the pot goes to the next member in the payout order.
            </Text>
          </View>
          <View style={styles.wrap}>
            {SAHOD.map((o) => {
              const on = o.value === sahodMode;
              return (
                <PressableScale
                  key={o.value}
                  hapticOnPress={false}
                  onPress={() => {
                    setSahodMode(o.value);
                    setPickedSahod(null);
                    setPickSahod(false);
                  }}
                  style={[styles.schedTile, { flexBasis: desktop ? '18%' : '31%', backgroundColor: on ? c.goldSoft : c.surface, borderColor: on ? c.gold : 'transparent' }]}>
                  <View style={[styles.schedIcon, { backgroundColor: on ? c.gold : c.surfaceAlt }]}>
                    <Feather name={o.icon} size={17} color={on ? '#fff' : c.textMuted} />
                  </View>
                  <Text variant="bodyBold">{o.title}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {sahodSub(o.value, o.sub)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {sahodMode === 'custom' && (
            <Card style={styles.stepper}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">Sahod every</Text>
                <Text variant="small" tone="muted">
                  Days between payouts
                </Text>
              </View>
              <Stepper value={sahodEvery} onChange={setSahodEvery} min={2} max={60} />
              <Text variant="bodyBold">days</Text>
            </Card>
          )}
          {payout && (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.schedIcon, { backgroundColor: c.goldSoft, marginBottom: 0 }]}>
                  <Feather name="gift" size={17} color={c.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="small" tone="muted">
                    First sahod
                  </Text>
                  <Text variant="h3">{longDate(payout.first_date)}</Text>
                </View>
                <Button title={pickSahod ? 'Done' : 'Change'} size="sm" variant="secondary" full={false} onPress={() => setPickSahod(!pickSahod)} />
              </View>
              {pickSahod && <MonthCalendar value={payout.first_date} onChange={(date) => setPickedSahod({ key: schedKey, date })} />}
              {!sahodValid && (
                <Text variant="small" tone="danger">
                  The first sahod can’t be before the first hulog ({longDate(firstHulog)}).
                </Text>
              )}
            </Card>
          )}
          <View style={[styles.datesRow, { backgroundColor: c.surface, alignItems: 'flex-start' }]}>
            <Feather name="gift" size={15} color={c.gold} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="small">
                <Text variant="smallBold">Sahod dates: </Text>
                {plan.slice(0, 4).map((x) => shortDate(x.payout_date)).join(', ')}
                {plan.length > 4 ? ', …' : ''}
              </Text>
              <Text variant="small" tone="muted">
                {perSahod > 1
                  ? pot != null
                    ? `Each sahod collects ${varies ? 'about ' : ''}${perSahod} hulog of ${peso(amt)} from ${memberCount} members, so the pot is ${varies ? 'about ' : ''}${peso(pot)}.`
                    : `Each sahod collects ${perSahod} hulog of ${peso(amt)} from every member (${peso(perMember)} each).`
                  : pot != null
                    ? `Each sahod is ${peso(pot)} (${peso(amt)} × ${memberCount} members).`
                    : `Each sahod is ${peso(amt)} × the number of members.`}
              </Text>
            </View>
          </View>

        </>
      )}

      {step === 5 && (
        <>
          {!managed && <Text variant="smallBold">Payout order</Text>}
          {!managed && (
          <ChoiceCard
            selected={orderMode === 'draw'}
            icon="shuffle"
            title="Verifiable random draw"
            body="Recommended. A cryptographic commitment lets every member confirm the draw wasn’t rigged."
            onPress={() => setOrderMode('draw')}
          />
          )}
          {!managed && (
          <ChoiceCard
            selected={orderMode === 'manual'}
            icon="list"
            title="Set by admin"
            body="Use this when members have already agreed on the order."
            onPress={() => setOrderMode('manual')}
          />
          )}
          {managed && (
            <Notice tone="success" icon="shuffle" title="You’ll pick a fun draw next" body="Spin the wheel, open lucky envelopes, pull a slot machine, drop a Plinko coin or play the claw machine. The payout order is decided fairly the moment the draw starts." />
          )}
          {!managed && (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.schedIcon, { backgroundColor: c.brandSoft, marginBottom: 0 }]}>
                  <Feather name="lock" size={17} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">Join password</Text>
                  <Text variant="small" tone="muted">
                    Members need the invite code and this password to join.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder="At least 4 characters"
                    value={password}
                    onChangeText={(v) => setPassword(v.slice(0, 64))}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <IconButton icon={showPw ? 'eye-off' : 'eye'} size={48} onPress={() => setShowPw(!showPw)} label={showPw ? 'Hide password' : 'Show password'} />
              </View>
              <Text variant="small" tone={password.length > 0 && password.length < 4 ? 'danger' : 'faint'}>
                {password.length > 0 && password.length < 4
                  ? 'Use at least 4 characters.'
                  : 'Tell it to members privately, not in the same message as the invite link. You can change it later.'}
              </Text>
            </Card>
          )}
          <Input
            label={managed ? 'Rules & notes (optional)' : 'Paluwagan agreement'}
            value={rules}
            onChangeText={setRules}
            multiline
            style={{ minHeight: 150 }}
            hint={managed ? 'For your reference, e.g. where members send payments.' : 'Every member must accept this agreement before joining.'}
          />
          {scam && (
            <Notice
              tone="warning"
              icon="alert-triangle"
              title="These rules mention interest or returns"
              body="A legitimate paluwagan pays out only what members contribute. Promised returns are a common sign of investment scams."
            />
          )}
        </>
      )}
    </Animated.View>
  );

  return (
    <Screen
      back
      title="New paluwagan"
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      narrow={!desktop}
      footer={footer}>
      <ProgressBar progress={(step + 1) / STEPS.length} color={c.brand} height={4} />
      {desktop ? <Columns main={form} side={summary} sideWidth={340} /> : form}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconTile: { flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.md, borderWidth: 2 },
  iconBubble: { width: 44, height: 44, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, overflow: 'hidden' },
  previewDeco: { position: 'absolute', right: -30, top: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.14)' },
  previewIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  schedTile: { flexGrow: 1, gap: 4, padding: 12, borderRadius: radius.md, borderWidth: 2 },
  schedIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.lg },
  bump: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  amountMid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  peso: { fontFamily: font.bold, fontSize: 30, lineHeight: 40, marginRight: 2 },
  amountInput: { fontFamily: font.black, fontSize: 40, lineHeight: 48, letterSpacing: -1.5, textAlign: 'left', paddingVertical: 4, fontVariant: ['tabular-nums'] },
  presets: { flexDirection: 'row', gap: 8 },
  preset: { flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchInner: { width: 28, height: 28, borderRadius: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperCtl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg },
  optionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  memberInput: { flex: 1, height: 40, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 15 },
});
