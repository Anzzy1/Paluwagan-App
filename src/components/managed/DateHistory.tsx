import { Feather } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Avatar, Chip, ProgressBar } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { parseDate, peso, shortDate, todayISO } from '@/lib/format';
import {
  dateShort,
  hulogDays,
  markAllPaid,
  missedPayments,
  paidLate,
  paidOn,
  potOfManaged,
  togglePaid,
  type HulogDay,
  type LocalCircle,
} from '@/lib/local';
import { useColors } from '@/lib/prefs';
import { reactToBackfill, reactToMarkPaid } from '@/lib/reactions';
import { radius } from '@/theme/tokens';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_W = 64;

function longDay(iso: string) {
  const d = parseDate(iso);
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}

/** Open on the earliest past day with missing payments, else today / the current round's next day. */
function defaultDay(c: LocalCircle, days: HulogDay[]): string | undefined {
  const today = todayISO();
  const n = c.members.length;
  const missed = days.find((d) => d.date < today && paidOn(d.round, d.date) < n);
  return (missed ?? days.find((d) => d.date >= today) ?? days[days.length - 1])?.date;
}

/**
 * Every hulog date up to today that isn't fully paid, newest first:
 * who still owes and how much. Tap a date to open it.
 */
function IncompleteDates({ circle, days, onOpen }: { circle: LocalCircle; days: HulogDay[]; onOpen: (date: string) => void }) {
  const c = useColors();
  const today = todayISO();
  const [all, setAll] = useState(false);
  const n = circle.members.length;
  const open = days.filter((d) => d.date <= today && paidOn(d.round, d.date) < n).reverse();
  if (!open.length) return null;
  const total = open.reduce((sum, d) => sum + dateShort(circle, d.round, d.date), 0);
  const shown = all ? open : open.slice(0, 5);
  return (
    <Card padded={false}>
      <View style={[styles.head, { paddingBottom: 12 }]}>
        <View style={[styles.headIcon, { backgroundColor: c.dangerBg }]}>
          <Feather name="calendar" size={18} color={c.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">Incomplete dates</Text>
          <Text variant="small" tone="muted">
            {open.length} date{open.length === 1 ? '' : 's'} not fully paid · {peso(total)} missing
          </Text>
        </View>
      </View>
      {shown.map((x) => {
        const d = parseDate(x.date);
        const isToday = x.date === today;
        const fg = isToday ? c.warning : c.danger;
        const bg = isToday ? c.warningBg : c.dangerBg;
        const unpaid = circle.members.filter((m) => !x.round.paid[x.date]?.[m.id]);
        return (
          <PressableScale key={x.date} hapticOnPress={false} scaleTo={0.99} onPress={() => onOpen(x.date)} style={[styles.row, { borderTopColor: c.border }]}>
            <View style={[styles.miniDay, { backgroundColor: bg }]}>
              <Text variant="caption" color={fg} style={{ fontSize: 10, lineHeight: 12 }}>
                {MON[d.getMonth()]}
              </Text>
              <Text variant="h3" color={fg} style={{ lineHeight: 20 }}>
                {d.getDate()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {isToday ? 'Today' : longDay(x.date)}
                <Text variant="small" tone="faint">
                  {'  '}
                  {n - unpaid.length}/{n} paid
                </Text>
              </Text>
              <Text variant="caption" color={fg} numberOfLines={1}>
                Unpaid: {unpaid.map((m) => m.name).join(', ')}
              </Text>
            </View>
            <Text variant="money" color={fg}>
              {peso(unpaid.length * circle.amount)}
            </Text>
            <Feather name="chevron-right" size={16} color={c.textFaint} />
          </PressableScale>
        );
      })}
      {open.length > 5 && (
        <PressableScale hapticOnPress={false} onPress={() => setAll(!all)} style={[styles.more, { borderTopColor: c.border }]}>
          <Text variant="smallBold" tone="brand">
            {all ? 'Show less' : `Show all ${open.length} dates`}
          </Text>
        </PressableScale>
      )}
    </Card>
  );
}

/**
 * Date history for a managed circle: go back to any hulog date, see who didn't pay,
 * check them off when they catch up, and see how much is still missing overall.
 */
export function DateHistory({ circle }: { circle: LocalCircle }) {
  const c = useColors();
  const today = todayISO();
  const days = hulogDays(circle);
  const [selected, setSelected] = useState(() => defaultDay(circle, days));
  const strip = useRef<ScrollViewInstance>(null);
  const missed = missedPayments(circle);
  const totalMissed = missed.reduce((s, b) => s + b.owed, 0);
  const missedCount = missed.reduce((s, b) => s + b.days.length, 0);
  const day = days.find((d) => d.date === selected) ?? days[0];
  if (!day) return null;

  const { date, round: r } = day;
  const n = circle.members.length;
  const recipient = circle.members.find((m) => m.id === r.member_id);
  const paidCount = paidOn(r, date);
  const short = dateShort(circle, r, date);
  const isPast = date < today;
  const isToday = date === today;
  const multi = r.dates.length > 1;

  const select = (d: string) => {
    setSelected(d);
    const i = days.findIndex((x) => x.date === d);
    strip.current?.scrollTo({ x: Math.max(0, i * (DAY_W + 8) - 80), animated: true });
  };

  const toggle = (memberId: string, name: string) => {
    const wasPaid = !!r.paid[date]?.[memberId];
    togglePaid(circle.id, r.round_no, memberId, date);
    if (wasPaid) return;
    const left = Math.max(0, short - circle.amount);
    if (isPast) reactToBackfill(name, shortDate(date), left, Math.max(0, totalMissed - circle.amount));
    else reactToMarkPaid(name, paidCount + 1, n, r.round_no, recipient?.name ?? 'the recipient', potOfManaged(circle, r));
  };

  const allPaid = () => {
    markAllPaid(circle.id, r.round_no, date);
    if (isPast) reactToBackfill('Everyone', shortDate(date), 0, Math.max(0, totalMissed - short));
    else reactToMarkPaid('Everyone', n, n, r.round_no, recipient?.name ?? 'the recipient', potOfManaged(circle, r));
  };

  const status =
    short === 0
      ? { label: 'Fully paid', tone: 'success' as const }
      : isPast
        ? { label: `${peso(short)} short`, tone: 'danger' as const }
        : isToday
          ? { label: 'Due today', tone: 'warning' as const }
          : { label: 'Upcoming', tone: 'neutral' as const };

  return (
    <View style={{ gap: 14 }}>
      <IncompleteDates circle={circle} days={days} onOpen={select} />

      {/* overall balances */}
      {missed.length > 0 ? (
        <Card padded={false}>
          <View style={[styles.head, { backgroundColor: c.dangerBg }]}>
            <View style={[styles.headIcon, { backgroundColor: c.surface }]}>
              <Feather name="alert-circle" size={18} color={c.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h3" tone="danger">
                {peso(totalMissed)} unpaid
              </Text>
              <Text variant="small" tone="danger">
                {missedCount} missed hulog on past dates. Tap a name to open the day.
              </Text>
            </View>
          </View>
          {missed.map((b) => (
            <PressableScale key={b.member.id} hapticOnPress={false} scaleTo={0.99} onPress={() => select(b.days[0].date)} style={[styles.row, { borderTopColor: c.border }]}>
              <Avatar name={b.member.name} seed={b.member.id} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {b.member.name}
                </Text>
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {b.days.length} missed · {b.days.map((x) => shortDate(x.date)).join(', ')}
                </Text>
              </View>
              <Text variant="money" tone="danger">
                {peso(b.owed)}
              </Text>
              <Feather name="chevron-right" size={16} color={c.textFaint} />
            </PressableScale>
          ))}
        </Card>
      ) : (
        days.some((x) => x.date < today) && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.successBg }}>
            <Feather name="check-circle" size={20} color={c.success} />
            <Text variant="bodyBold" tone="success" style={{ flex: 1 }}>
              Everyone is paid up on past dates.
            </Text>
          </Card>
        )
      )}

      {/* date strip */}
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8, paddingBottom: 2, paddingHorizontal: 6 }}>
        {days.map((x) => {
          const d = parseDate(x.date);
          const on = x.date === selected;
          const s = dateShort(circle, x.round, x.date);
          const past = x.date < today;
          const isPayout = x.date === x.round.due_date && x.round.dates.length > 1;
          const isToday = x.date === today;
          // Red = past and not complete, amber = today and not complete, green = complete.
          const state = s === 0 ? 'done' : past ? 'missed' : isToday ? 'today' : 'upcoming';
          const dot = { done: c.success, missed: c.danger, today: c.warning, upcoming: c.borderStrong }[state];
          const tint = state === 'missed' ? c.dangerBg : state === 'today' ? c.warningBg : c.surface;
          const edge = on ? 'transparent' : state === 'missed' ? c.danger : state === 'today' ? c.warning : 'transparent';
          const fg = on ? c.onInk : state === 'missed' ? c.danger : state === 'today' ? c.warning : c.text;
          const unpaid = s / circle.amount;
          return (
            <PressableScale
              key={x.date}
              hapticOnPress={false}
              onPress={() => select(x.date)}
              accessibilityLabel={`${longDay(x.date)}${s ? `, ${peso(s)} short` : ', fully paid'}${isPayout ? ', payout day' : ''}`}
              style={[styles.day, { backgroundColor: on ? c.ink : tint, borderColor: edge, opacity: state === 'upcoming' && !on ? 0.75 : 1 }]}>
              <Text variant="caption" color={on ? c.onInk : state === 'missed' || state === 'today' ? fg : c.textMuted}>
                {isToday ? 'Today' : DOW[d.getDay()]}
              </Text>
              <Text variant="h2" color={fg} style={{ lineHeight: 24 }}>
                {d.getDate()}
              </Text>
              <Text variant="caption" color={on ? c.inkMuted : c.textFaint} style={{ fontSize: 10, lineHeight: 12 }}>
                {MON[d.getMonth()]}
              </Text>
              <View style={[styles.dot, { backgroundColor: dot }]}>{s === 0 && <Feather name="check" size={8} color="#fff" />}</View>
              {(state === 'missed' || state === 'today') && (
                <View style={[styles.countTag, { backgroundColor: dot, borderColor: on ? c.ink : tint }]}>
                  <Text variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 12, fontWeight: '800' }}>
                    {state === 'missed' ? '!' : unpaid}
                  </Text>
                </View>
              )}
              {isPayout && (
                <View style={[styles.payoutTag, { backgroundColor: c.gold }]}>
                  <Feather name="gift" size={9} color="#fff" />
                </View>
              )}
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.legend}>
        {[
          { color: c.danger, label: 'Not complete' },
          { color: c.warning, label: 'Today, not complete' },
          { color: c.success, label: 'Complete' },
        ].map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.color }} />
            <Text variant="caption" tone="muted">
              {l.label}
            </Text>
          </View>
        ))}
      </View>

      {/* selected day */}
      <Card padded={false}>
        <View style={{ padding: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" tone="faint">
                {multi ? `Hulog ${r.dates.indexOf(date) + 1} of ${r.dates.length} · ` : ''}Payout {r.round_no} of {circle.rounds.length}
                {isToday ? ' · Today' : ''}
              </Text>
              <Text variant="h2">{longDay(date)}</Text>
              <Text variant="small" tone="muted">
                Sahod: {recipient?.name ?? '—'} on {shortDate(r.due_date)}
                {r.status === 'completed' && r.payout_at ? ` · released ${shortDate(r.payout_at.slice(0, 10))}` : ''}
              </Text>
            </View>
            <Chip label={status.label} tone={status.tone} />
          </View>
          <ProgressBar progress={paidCount / n} color={short === 0 ? c.success : isPast ? c.danger : c.brand} height={8} />
          <Text variant="caption" tone="muted">
            {paidCount}/{n} paid · {peso(paidCount * circle.amount)} of {peso(n * circle.amount)} this day
          </Text>
        </View>
        {circle.members.map((m) => {
          const isRecipient = m.id === r.member_id;
          const at = r.paid[date]?.[m.id];
          const late = paidLate(circle, date, at);
          const sub = at
            ? `Paid ${shortDate(at.slice(0, 10))}${late ? ' · late' : date > today ? ' · in advance' : ''}`
            : isPast
              ? `Missed · owes ${peso(circle.amount)}`
              : `Owes ${peso(circle.amount)}`;
          return (
            <PressableScale
              key={m.id}
              hapticOnPress
              scaleTo={0.99}
              onPress={() => toggle(m.id, m.name)}
              style={[styles.row, { borderTopColor: c.border }, !!at && { backgroundColor: c.successBg }, !at && isPast && { backgroundColor: c.dangerBg }]}>
              <Avatar name={m.name} seed={m.id} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {m.name}
                </Text>
                <Text variant="caption" tone={!at && isPast ? 'danger' : late ? 'warning' : 'faint'}>
                  {sub}
                </Text>
              </View>
              {isRecipient && (r.status === 'completed' ? <Chip label="Got sahod" tone="neutral" icon="check" /> : <Chip label="Sahod" tone="brand" icon="gift" />)}
              <View style={[styles.check, { backgroundColor: at ? c.success : c.surface, borderColor: at ? c.success : isPast ? c.danger : c.borderStrong }]}>
                {at && <Feather name="check" size={16} color="#fff" />}
              </View>
            </PressableScale>
          );
        })}
        {short > 0 && (
          <View style={[styles.footer, { borderTopColor: c.border }]}>
            <Text variant="small" tone="muted" style={{ flex: 1 }}>
              {isPast ? 'Tap a name when they pay what they missed.' : 'Tap a name when they pay.'}
            </Text>
            <Button title="Mark all paid" icon="check-square" variant="secondary" size="sm" full={false} onPress={allPaid} />
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  headIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  day: { width: DAY_W, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', gap: 1, borderWidth: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5, alignItems: 'center', justifyContent: 'center' },
  countTag: { position: 'absolute', top: -6, left: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  miniDay: { width: 44, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  more: { alignItems: 'center', paddingVertical: 12, borderTopWidth: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: -6 },
  payoutTag: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1 },
});
