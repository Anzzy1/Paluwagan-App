import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AnimatedMascot } from '@/components/AnimatedMascot';
import { ConfirmSheet } from '@/components/circle/Lifecycle';
import { DateHistory } from '@/components/managed/DateHistory';
import { Mascot } from '@/components/Mascot';
import { Avatar, Chip, Notice, ProgressBar, PurposeIcon, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { confirmAction } from '@/lib/alert';
import { dateTime, daysUntil, longDate, payoutShort, peso, relativeDue, shortDate, timeAgo } from '@/lib/format';
import {
  addMember,
  collected,
  deleteManagedCircle,
  hulogToday,
  managedSummary,
  nextHulog,
  paidOn,
  releasedEarly,
  missedPayments,
  markAllPaid,
  potOfManaged,
  roundShort,
  releasePayout,
  removeMember,
  togglePaid,
  useManagedCircle,
  type LocalCircle,
} from '@/lib/local';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { reactToMarkPaid, reactToPayout } from '@/lib/reactions';
import { font, radius } from '@/theme/tokens';

type Tab = 'dates' | 'schedule' | 'log';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 110, gap: 2 }}>
      <Text variant="overline" color="rgba(255,255,255,0.75)">
        {label}
      </Text>
      <Text variant="h2" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

/** Red "Delete paluwagan" button + the in-app warning sheet (no browser confirm). */
function DeleteManagedButton({ circle }: { circle: LocalCircle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title="Delete paluwagan" icon="trash-2" variant="danger" size="md" onPress={() => setOpen(true)} />
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        icon="trash-2"
        title="Delete this paluwagan?"
        points={[
          `“${circle.name}”, its members, payments and history will be removed from this device.`,
          'This can’t be undone.',
        ]}
        confirmLabel="Delete paluwagan"
        onConfirm={() => {
          setOpen(false);
          deleteManagedCircle(circle.id);
          router.replace('/circles');
        }}
      />
    </>
  );
}

function MembersEditor({ circle }: { circle: LocalCircle }) {
  const c = useColors();
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    addMember(circle.id, name);
    setName('');
    haptic('light');
  };
  return (
    <Card padded={false}>
      <View style={styles.head}>
        <Text variant="h3">Members</Text>
        <Chip label={`${circle.members.length} members`} tone="brand" />
      </View>
      {circle.members.map((m, i) => (
        <View key={m.id} style={[styles.row, { borderTopColor: c.border }]}>
          <Text variant="smallBold" tone="faint" style={{ width: 20 }}>
            {i + 1}
          </Text>
          <Avatar name={m.name} seed={m.id} size={34} />
          <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
            {m.name}
          </Text>
          <PressableScale onPress={() => removeMember(circle.id, m.id)} accessibilityLabel={`Remove ${m.name}`} style={[styles.iconBtn, { backgroundColor: c.dangerBg }]}>
            <Feather name="x" size={15} color={c.danger} />
          </PressableScale>
        </View>
      ))}
      <View style={[styles.row, { borderTopColor: c.border }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          placeholder="Add a member’s name"
          placeholderTextColor={c.textFaint}
          returnKeyType="done"
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, fontFamily: font.regular }, { outlineStyle: 'none' } as never]}
        />
        <Button title="Add" icon="plus" size="sm" full={false} onPress={add} disabled={!name.trim()} />
      </View>
    </Card>
  );
}

/**
 * Today's hulog checklist. Only shows when a hulog is due today (in whichever payout round
 * that date belongs to); otherwise a one-line note with the next hulog date.
 */
function HulogToday({ circle }: { circle: LocalCircle }) {
  const c = useColors();
  const n = circle.members.length;
  const day = hulogToday(circle);

  if (!day) {
    const next = nextHulog(circle);
    if (!next) return null;
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.iconBtn, { backgroundColor: c.surfaceAlt, width: 40, height: 40, borderRadius: 20 }]}>
          <Feather name="calendar" size={18} color={c.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">No hulog today</Text>
          <Text variant="caption" tone="faint">
            Next hulog {longDate(next.date)} · {relativeDue(next.date).replace('Due ', '')}
          </Text>
        </View>
      </Card>
    );
  }

  const { date, round: r } = day;
  const paidCount = paidOn(r, date);
  const allPaid = paidCount >= n;
  const recipient = circle.members.find((m) => m.id === r.member_id);
  const pot = potOfManaged(circle, r);

  return (
    <Card padded={false}>
      <View style={[styles.dayHead, { borderTopWidth: 0, paddingVertical: 14, backgroundColor: allPaid ? c.successBg : c.surfaceAlt }]}>
        <Feather name={allPaid ? 'check-circle' : 'calendar'} size={18} color={allPaid ? c.success : c.brand} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">Hulog today</Text>
          <Text variant="caption" tone="muted">
            {peso(circle.amount)} each · for {recipient ? `${recipient.name}’s` : 'this'} sahod (payout {r.round_no})
            {r.status === 'completed' ? ' · sahod already released' : ''}
          </Text>
        </View>
        <Chip label={allPaid ? 'All paid' : `${paidCount}/${n} paid`} tone={allPaid ? 'success' : 'neutral'} />
      </View>
      {circle.members.map((m) => {
        const isRecipient = m.id === r.member_id;
        const paidAt = r.paid[date]?.[m.id];
        return (
          <PressableScale
            key={m.id}
            disabled={isRecipient}
            dimWhenDisabled={false}
            hapticOnPress
            scaleTo={0.99}
            onPress={() => {
              togglePaid(circle.id, r.round_no, m.id, date);
              if (!paidAt) reactToMarkPaid(m.name, paidCount + 1, n, r.round_no, recipient?.name ?? 'the recipient', pot);
            }}
            style={[styles.row, { borderTopColor: c.border }, !!paidAt && !isRecipient && { backgroundColor: c.successBg }]}>
            <Avatar name={m.name} seed={m.id} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {m.name}
              </Text>
              <Text variant="caption" tone="faint">
                {isRecipient ? 'Receives this sahod' : paidAt ? `Paid ${timeAgo(paidAt)}` : `Owes ${peso(circle.amount)}`}
              </Text>
            </View>
            {isRecipient ? (
              <Chip label="Sahod" tone="brand" icon="gift" />
            ) : (
              <View style={[styles.check, { backgroundColor: paidAt ? c.success : c.surface, borderColor: paidAt ? c.success : c.borderStrong }]}>
                {paidAt && <Feather name="check" size={16} color="#fff" />}
              </View>
            )}
          </PressableScale>
        );
      })}
      {!allPaid && (
        <View style={[styles.actions, { borderTopColor: c.border }]}>
          <Button
            title="Mark all paid"
            icon="check-square"
            variant="secondary"
            size="md"
            onPress={() => {
              markAllPaid(circle.id, r.round_no, date);
              reactToMarkPaid('Everyone', n, n, r.round_no, recipient?.name ?? 'the recipient', pot);
            }}
          />
        </View>
      )}
    </Card>
  );
}

/**
 * The next sahod (payout). Release on/after its scheduled date, or give it early as an advance.
 */
function SahodCard({ circle }: { circle: LocalCircle }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const s = managedSummary(circle);
  const r = s.current!;
  const name = s.recipient?.name ?? 'the recipient';
  const pot = potOfManaged(circle, r);
  const got = collected(circle, r);
  const missing = roundShort(circle, r);
  const fullyFunded = missing === 0;
  const daysLeft = daysUntil(r.due_date);
  const due = daysLeft <= 0;
  const multi = r.dates.length > 1;

  const go = (amount: number) => {
    releasePayout(circle.id, r.round_no);
    haptic('success');
    reactToPayout(name, amount, r.round_no < circle.rounds.length ? r.round_no + 1 : null);
  };
  const release = () => {
    if (fullyFunded) confirmAction(`Release sahod to ${name}?`, `Hand over ${peso(pot)} and move to the next payout.`, () => go(pot), { confirmText: 'Release sahod', icon: 'gift' });
    else confirmAction('Not fully funded yet', `${peso(missing)} of hulog is still unpaid for this payout. Release ${peso(got)} anyway?`, () => go(got), { confirmText: 'Release anyway', destructive: true });
  };
  const advance = () =>
    confirmAction(
      `Advance sahod to ${name}?`,
      `Release ${peso(pot)} ${daysLeft} day${daysLeft === 1 ? '' : 's'} before the sahod date (${longDate(r.due_date)}). ${peso(got)} is collected so far${
        missing ? `; the remaining ${peso(missing)} of hulog is still collected on its dates.` : '.'
      }`,
      () => go(pot),
      { confirmText: 'Advance sahod', icon: 'fast-forward' },
    );

  return (
    <Card padded={false}>
      <View style={[styles.recipient, { backgroundColor: c.goldSoft }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="overline" tone="muted">
            Sahod {r.round_no} of {circle.rounds.length} · {longDate(r.due_date)}
          </Text>
          <Text variant="small" tone="muted">
            Next sahod goes to
          </Text>
          <Text variant="h1">{s.recipient?.name}</Text>
          <Chip
            label={due ? (fullyFunded ? 'Ready to release' : s.overdue ? 'Some hulog missed' : relativeDue(r.due_date)) : relativeDue(r.due_date).replace('Due', 'Sahod')}
            tone={due ? (fullyFunded ? 'success' : 'warning') : 'neutral'}
          />
        </View>
        <AnimatedMascot size={86} mood={fullyFunded ? 'excited' : s.overdue ? 'worried' : 'happy'} pose={fullyFunded ? 'cheer' : 'coin'} trigger={got} action={fullyFunded ? 'cheer' : 'toss'} />
      </View>

      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="smallBold">Collected for this sahod</Text>
          <Text variant="smallBold" tone="muted">
            {peso(got)} of {peso(pot)}
          </Text>
        </View>
        <ProgressBar progress={pot ? got / pot : 0} height={10} color={c.success} />
        {multi && (
          <Text variant="caption" tone="faint">
            {r.dates.length} hulog of {peso(circle.amount)} from {circle.members.length} members · {shortDate(r.dates[0])} to {shortDate(r.dates[r.dates.length - 1])}
          </Text>
        )}
      </View>

      <View style={[styles.actions, { borderTopColor: c.border }]}>
        {due ? (
          <Button title={desktop ? `Release sahod to ${name}` : 'Release sahod'} icon="gift" variant="brand" size="md" onPress={release} style={{ flex: 1 }} />
        ) : (
          <>
            <Text variant="caption" tone="muted" style={{ flex: 1, minWidth: 160, alignSelf: 'center' }}>
              Release opens on {longDate(r.due_date)}. Need it sooner? Give it as an advance.
            </Text>
            <Button title="Advance sahod" icon="fast-forward" variant="secondary" size="md" full={false} onPress={advance} />
          </>
        )}
      </View>
    </Card>
  );
}

function Schedule({ circle }: { circle: LocalCircle }) {
  const c = useColors();
  return (
    <Card padded={false}>
      {circle.rounds.map((r, i) => {
        const m = circle.members.find((x) => x.id === r.member_id);
        const active = r.status === 'active';
        const got = collected(circle, r);
        const pot = potOfManaged(circle, r);
        return (
          <View key={r.round_no} style={[styles.row, i > 0 && { borderTopColor: c.border, borderTopWidth: 1 }, i === 0 && { borderTopWidth: 0 }, active && { backgroundColor: c.surfaceAlt }]}>
            <View style={[styles.num, { backgroundColor: r.status === 'completed' ? c.successBg : active ? c.ink : c.surfaceAlt }]}>
              {r.status === 'completed' ? (
                <Feather name="check" size={14} color={c.success} />
              ) : (
                <Text variant="smallBold" color={active ? c.onInk : c.textMuted}>
                  {r.round_no}
                </Text>
              )}
            </View>
            <Avatar name={m?.name} seed={m?.id} size={30} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {m?.name}
              </Text>
              <Text variant="caption" tone="faint">
                Sahod {shortDate(r.due_date)}
                {r.dates.length > 1 ? ` · ${r.dates.length} hulog` : ''} ·{' '}
                {r.status === 'completed' && r.payout_at
                  ? `${releasedEarly(r) ? 'advanced' : 'released'} ${shortDate(r.payout_at.slice(0, 10))}`
                  : `${peso(got)} of ${peso(pot)}`}
              </Text>
            </View>
            {active && <Chip label="Current" tone="ink" />}
          </View>
        );
      })}
    </Card>
  );
}

export default function ManagedCircle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const desktop = useIsDesktop();
  const circle = useManagedCircle(id);
  const tint = useTint(circle?.color);
  const [tab, setTab] = useState<Tab>('dates');

  if (!circle) {
    return (
      <Screen back title="Paluwagan not found">
        <Text tone="muted">This managed paluwagan isn’t on this device.</Text>
      </Screen>
    );
  }
  const s = managedSummary(circle);
  const n = circle.members.length;
  const missedTotal = missedPayments(circle).reduce((sum, b) => sum + b.owed, 0);

  const hero = (
    <LinearGradient colors={tint.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={[styles.heroDeco, { right: -50, top: -70 }]} />
      <View style={[styles.heroDeco, { right: 120, bottom: -120, width: 200, height: 200 }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={styles.heroIcon}>
          <PurposeIcon icon={circle.emoji} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant={desktop ? 'display' : 'h1'} color="#fff" numberOfLines={2}>
            {circle.name}
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.85)">
            {payoutShort(circle)} · Starts {longDate(circle.start_date)}
          </Text>
        </View>
        <View style={styles.heroPill}>
          <Feather name="smartphone" size={12} color="#fff" />
          <Text variant="caption" color="#fff">
            Managed offline
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Metric label="Per sahod" value={peso(potOfManaged(circle, circle.rounds[0]))} />
        <Metric label="Contribution" value={peso(circle.amount)} />
        <Metric label="Members" value={String(n)} />
        <Metric label="Progress" value={circle.rounds.length ? `${s.completed}/${circle.rounds.length} rounds` : 'Not drawn'} />
      </View>
    </LinearGradient>
  );

  const forming = circle.status === 'forming' && (
    <>
      <Notice
        tone="info"
        icon="smartphone"
        title="You manage this paluwagan on this device"
        body="Members don’t need the app. Add everyone below, then run a fun draw together to decide the payout order."
      />
      <MembersEditor circle={circle} />
      <Button title="Start the draw" icon="shuffle" variant="brand" disabled={n < 2} onPress={() => router.push(`/managed/${circle.id}/draw` as Href)} />
      {n < 2 && (
        <Text variant="small" tone="faint" center>
          Add at least 2 members to start the draw.
        </Text>
      )}
    </>
  );

  const running = circle.status !== 'forming' && (
    <>
      <HulogToday circle={circle} />
      {circle.status === 'active' && s.current && <SahodCard circle={circle} />}
      {circle.status === 'completed' && (
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
          <Mascot size={110} mood="excited" pose="cheer" />
          <Text variant="h2">Paluwagan complete!</Text>
          <Text tone="muted" center>
            All {circle.rounds.length} payouts have been released. Great job keeping everyone on track.
          </Text>
        </Card>
      )}
      {missedTotal > 0 && tab !== 'dates' && (
        <PressableScale onPress={() => setTab('dates')} hapticOnPress={false} style={[styles.missed, { backgroundColor: c.dangerBg }]}>
          <Feather name="alert-circle" size={18} color={c.danger} />
          <Text variant="smallBold" tone="danger" style={{ flex: 1 }}>
            {peso(missedTotal)} unpaid from past dates
          </Text>
          <Text variant="smallBold" tone="danger">
            Review
          </Text>
        </PressableScale>
      )}
      <View style={{ maxWidth: desktop ? 440 : undefined }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'dates', label: 'Dates' },
            { value: 'schedule', label: 'Payout order' },
            { value: 'log', label: 'Activity' },
          ]}
        />
      </View>
      {tab === 'dates' ? (
        <DateHistory circle={circle} />
      ) : tab === 'schedule' ? (
        <Schedule circle={circle} />
      ) : (
        <Card style={{ gap: 12 }}>
          {circle.log.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.logDot, { backgroundColor: c.brand }]} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{l.text}</Text>
                <Text variant="caption" tone="faint">
                  {dateTime(l.at)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </>
  );

  const side = (
    <>
      {circle.status !== 'forming' && (
        <Card style={{ gap: 10 }}>
          <Text variant="h3">Draw</Text>
          <Text variant="small" tone="muted">
            Payout order was decided with a verifiable draw{circle.drawn_at ? ` on ${dateTime(circle.drawn_at)}` : ''}.
          </Text>
          <Button title="View draw & verify" icon="shield" variant="secondary" size="md" onPress={() => router.push(`/managed/${circle.id}/draw` as Href)} />
        </Card>
      )}
      {circle.notes ? (
        <Card style={{ gap: 6 }}>
          <Text variant="h3">Notes</Text>
          <Text variant="small" tone="muted">
            {circle.notes}
          </Text>
        </Card>
      ) : null}
      <DeleteManagedButton circle={circle} />
    </>
  );

  return (
    <Screen back>
      {hero}
      <Columns
        main={
          <>
            {forming}
            {running}
          </>
        }
        side={side}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22, gap: 22, overflow: 'hidden' },
  heroDeco: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.1)' },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 42, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15 },
  recipient: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, flexWrap: 'wrap' },
  num: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  missed: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
});
