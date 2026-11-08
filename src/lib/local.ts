/**
 * Managed (offline) circles.
 *
 * One organiser runs the whole paluwagan on their own device: members don't need the app.
 * Everything is stored locally (localStorage on web, SQLite-backed storage on native),
 * so it works without internet or a server.
 *
 * Hulog (contribution) and sahod (payout) can run on different schedules, e.g. daily hulog
 * with a weekly sahod: each payout round then collects several hulog dates.
 */
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { seededShuffle } from '@/lib/draw';
import { shortDate, todayISO, toISODate, parseDate } from '@/lib/format';
import { kv } from '@/lib/storage';
import type { Frequency } from '@/lib/types';
import type { CircleTint } from '@/theme/tokens';

export type DrawStyle = 'wheel' | 'envelopes' | 'slots' | 'plinko' | 'claw' | LegacyDrawStyle;
/** Retired games; draws saved with them replay as Slot Machine / Plinko. */
export type LegacyDrawStyle = 'race' | 'balls';

export type LocalMember = { id: string; name: string; phone?: string };

/** When the pot is handed out. `null` = on every hulog date (the classic paluwagan). */
export type PayoutSchedule = { frequency: Frequency; interval_days: number | null; first_date: string } | null;

export type LocalRound = {
  round_no: number;
  member_id: string;
  /** Payout (sahod) date for this round. */
  due_date: string;
  /** Hulog dates collected for this payout (just [due_date] when hulog and sahod are the same). */
  dates: string[];
  status: 'upcoming' | 'active' | 'completed';
  /** hulog date -> memberId -> ISO time paid. Everyone pays, the sahod recipient included. */
  paid: Record<string, Record<string, string>>;
  payout_at: string | null;
};

export type LocalCircle = {
  id: string;
  name: string;
  emoji: string;
  color: CircleTint;
  amount: number;
  frequency: Frequency;
  /** Days between payments when frequency is 'custom'. */
  interval_days?: number | null;
  start_date: string;
  /** Separate sahod schedule, if any. */
  payout?: PayoutSchedule;
  late_fee: number;
  grace_days: number;
  notes: string;
  status: 'forming' | 'active' | 'completed';
  members: LocalMember[];
  seed: string | null;
  seed_hash: string | null;
  order: string[] | null;
  draw_style: DrawStyle | null;
  drawn_at: string | null;
  rounds: LocalRound[];
  log: { at: string; text: string }[];
  created_at: string;
};

const KEY = 'managed-circles-v1';

/**
 * Older versions auto-counted the sahod recipient's own hulog ('recipient' marker).
 * Past dates stay counted (as paid on the day) so they don't suddenly show as missed;
 * today and future dates go back to unpaid, so the recipient is marked like everyone else.
 */
function dropRecipientShare(paid: LocalRound['paid']): LocalRound['paid'] {
  const today = todayISO();
  return Object.fromEntries(
    Object.entries(paid).map(([date, day]) => [
      date,
      Object.fromEntries(
        Object.entries(day).flatMap(([id, at]) => (at !== 'recipient' ? [[id, at]] : date < today ? [[id, `${date}T00:00:00.000Z`]] : [])),
      ),
    ]),
  );
}

/** Upgrade circles saved before hulog/sahod schedules were separate. */
function normalize(c: LocalCircle): LocalCircle {
  return {
    ...c,
    payout: c.payout ?? null,
    rounds: (c.rounds ?? []).map((r) => {
      const legacy = r.paid as unknown as Record<string, string>;
      const round = Array.isArray(r.dates) ? r : { ...r, dates: [r.due_date], paid: { [r.due_date]: legacy ?? {} } };
      return { ...round, paid: dropRecipientShare(round.paid) };
    }),
  };
}

// ---------------------------------------------------------------- tiny persistent store
let state: LocalCircle[] = (() => {
  try {
    return (JSON.parse(kv.get(KEY) ?? '[]') as LocalCircle[]).map(normalize);
  } catch {
    return [];
  }
})();
const listeners = new Set<() => void>();

function commit(next: LocalCircle[]) {
  state = next;
  kv.set(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getSnapshot = () => state;

export function useManagedCircles(): LocalCircle[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
export function useManagedCircle(id: string | undefined): LocalCircle | undefined {
  const all = useManagedCircles();
  return all.find((c) => c.id === id);
}

function update(id: string, fn: (c: LocalCircle) => LocalCircle) {
  commit(state.map((c) => (c.id === id ? fn(c) : c)));
}
const log = (c: LocalCircle, text: string): LocalCircle => ({ ...c, log: [{ at: new Date().toISOString(), text }, ...c.log] });
const uid = () => Crypto.randomUUID();

// ---------------------------------------------------------------- schedule (mirrors SQL round_due_date)
export function roundDueDate(freq: Frequency, start: string, k: number, everyDays?: number | null): string {
  const s = parseDate(start);
  if (freq === 'daily' || freq === 'custom') {
    const d = new Date(s);
    d.setDate(d.getDate() + (k - 1) * (freq === 'daily' ? 1 : Math.max(1, everyDays ?? 1)));
    return toISODate(d);
  }
  if (freq === 'weekly') {
    const d = new Date(s);
    d.setDate(d.getDate() + (k - 1) * 7);
    return toISODate(d);
  }
  if (freq === 'monthly') {
    const target = new Date(s.getFullYear(), s.getMonth() + (k - 1), 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return toISODate(new Date(target.getFullYear(), target.getMonth(), Math.min(s.getDate(), last)));
  }
  // semi-monthly: every 15th and last day of the month, on/after start
  let n = 0;
  let y = s.getFullYear();
  let m = s.getMonth();
  for (;;) {
    for (const d of [new Date(y, m, 15), new Date(y, m + 1, 0)]) {
      if (d >= s) {
        n++;
        if (n === k) return toISODate(d);
      }
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
}

/**
 * Payout plan: for each payout round, its sahod date and the hulog dates it collects.
 * Hulog dates are assigned to the first payout on or after them. Mirrors SQL _start_circle.
 */
export function payoutPlan(
  hulog: { frequency: Frequency; interval_days?: number | null; start_date: string },
  payout: PayoutSchedule,
  rounds: number,
): { payout_date: string; dates: string[] }[] {
  if (!payout) {
    return Array.from({ length: rounds }, (_, i) => {
      const d = roundDueDate(hulog.frequency, hulog.start_date, i + 1, hulog.interval_days);
      return { payout_date: d, dates: [d] };
    });
  }
  const payouts = Array.from({ length: rounds }, (_, i) => roundDueDate(payout.frequency, payout.first_date, i + 1, payout.interval_days));
  const plan = payouts.map((p) => ({ payout_date: p, dates: [] as string[] }));
  const last = payouts[payouts.length - 1];
  for (let j = 1; j < 5000; j++) {
    const d = roundDueDate(hulog.frequency, hulog.start_date, j, hulog.interval_days);
    if (d > last) break;
    const k = payouts.findIndex((p) => d <= p);
    if (k >= 0) plan[k].dates.push(d);
  }
  // A payout with no hulog date in its period collects one hulog on the payout date itself.
  return plan.map((p) => (p.dates.length ? p : { ...p, dates: [p.payout_date] }));
}

/** Suggested first sahod date for a payout schedule, given when hulog starts. */
export function suggestFirstPayout(start: string, freq: Frequency, everyDays: number | null): string {
  const s = parseDate(start);
  if (freq === 'weekly' || freq === 'custom' || freq === 'daily') {
    s.setDate(s.getDate() + (freq === 'weekly' ? 6 : freq === 'daily' ? 0 : Math.max(1, everyDays ?? 1) - 1));
    return toISODate(s);
  }
  if (freq === 'monthly') {
    s.setMonth(s.getMonth() + 1);
    s.setDate(s.getDate() - 1);
    return toISODate(s);
  }
  return roundDueDate('kinsenas', start, 1);
}

// ---------------------------------------------------------------- actions
export type NewManaged = Pick<LocalCircle, 'name' | 'emoji' | 'color' | 'amount' | 'frequency' | 'interval_days' | 'start_date' | 'payout' | 'late_fee' | 'grace_days' | 'notes'> & {
  memberNames: string[];
};

export function createManagedCircle(input: NewManaged): string {
  const id = `local-${uid()}`;
  const { memberNames, ...rest } = input;
  const c: LocalCircle = {
    ...rest,
    id,
    status: 'forming',
    members: memberNames.map((name) => ({ id: uid(), name: name.trim() })).filter((m) => m.name),
    seed: null,
    seed_hash: null,
    order: null,
    draw_style: null,
    drawn_at: null,
    rounds: [],
    log: [{ at: new Date().toISOString(), text: 'Paluwagan created' }],
    created_at: new Date().toISOString(),
  };
  commit([c, ...state]);
  return id;
}

export function addMember(id: string, name: string) {
  const n = name.trim();
  if (!n) return;
  update(id, (c) => log({ ...c, members: [...c.members, { id: uid(), name: n }] }, `${n} added`));
}

export function removeMember(id: string, memberId: string) {
  update(id, (c) => {
    const m = c.members.find((x) => x.id === memberId);
    return log({ ...c, members: c.members.filter((x) => x.id !== memberId) }, `${m?.name ?? 'Member'} removed`);
  });
}

export function renameMember(id: string, memberId: string, name: string) {
  update(id, (c) => ({ ...c, members: c.members.map((m) => (m.id === memberId ? { ...m, name: name.trim() || m.name } : m)) }));
}

/** Commit-reveal style: random seed, published hash, deterministic shuffle (same algorithm as online). */
export async function prepareDraw(id: string): Promise<{ seed: string; hash: string; order: string[] }> {
  const c = state.find((x) => x.id === id);
  if (!c) throw new Error('Paluwagan not found');
  if (c.members.length < 2) throw new Error('Add at least 2 members first');
  const bytes = Crypto.getRandomBytes(32);
  const seed = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const sha = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
  const hash = await sha(seed);
  const order = await seededShuffle(seed, c.members.map((m) => m.id), sha);
  return { seed, hash, order };
}

export function commitDraw(id: string, draw: { seed: string; hash: string; order: string[] }, style: DrawStyle) {
  update(id, (c) => {
    const plan = payoutPlan(c, c.payout ?? null, draw.order.length);
    const rounds: LocalRound[] = draw.order.map((memberId, i) => ({
      round_no: i + 1,
      member_id: memberId,
      due_date: plan[i].payout_date,
      dates: plan[i].dates,
      status: i === 0 ? 'active' : 'upcoming',
      // Everyone pays every hulog, including whoever receives this sahod.
      paid: Object.fromEntries(plan[i].dates.map((d) => [d, {}])),
      payout_at: null,
    }));
    return log(
      { ...c, status: 'active', seed: draw.seed, seed_hash: draw.hash, order: draw.order, draw_style: style, drawn_at: new Date().toISOString(), rounds },
      'Draw completed, payout order set',
    );
  });
}

/** Mark / unmark one member's hulog for one date. */
export function togglePaid(id: string, roundNo: number, memberId: string, date: string) {
  update(id, (c) => {
    const name = c.members.find((m) => m.id === memberId)?.name ?? 'Member';
    let text = '';
    const rounds = c.rounds.map((r) => {
      const day = r.paid[date] ?? {};
      if (r.round_no !== roundNo) return r;
      const next = { ...day };
      if (next[memberId]) {
        delete next[memberId];
        text = `${name} marked unpaid for ${shortDate(date)}`;
      } else {
        next[memberId] = new Date().toISOString();
        text = `${name} paid for ${shortDate(date)}${date < todayISO() ? ' (late)' : ''}`;
      }
      return { ...r, paid: { ...r.paid, [date]: next } };
    });
    return text ? log({ ...c, rounds }, text) : c;
  });
}

/** Mark everyone paid for one hulog date. */
export function markAllPaid(id: string, roundNo: number, date: string) {
  update(id, (c) => {
    const now = new Date().toISOString();
    const rounds = c.rounds.map((r) => {
      if (r.round_no !== roundNo) return r;
      const day = r.paid[date] ?? {};
      return { ...r, paid: { ...r.paid, [date]: Object.fromEntries(c.members.map((m) => [m.id, day[m.id] ?? now])) } };
    });
    return log({ ...c, rounds }, `Everyone marked paid for ${shortDate(date)}`);
  });
}

/** Hand over the pot for a round and move on to the next. */
export function releasePayout(id: string, roundNo: number) {
  update(id, (c) => {
    const round = c.rounds.find((r) => r.round_no === roundNo);
    const name = c.members.find((m) => m.id === round?.member_id)?.name ?? 'Member';
    const early = round && todayISO() < round.due_date ? ` (advance, due ${shortDate(round.due_date)})` : '';
    const rounds = c.rounds.map((r) => {
      if (r.round_no === roundNo) return { ...r, status: 'completed' as const, payout_at: new Date().toISOString() };
      if (r.round_no === roundNo + 1) return { ...r, status: 'active' as const };
      return r;
    });
    const done = rounds.every((r) => r.status === 'completed');
    return log({ ...c, rounds, status: done ? 'completed' : c.status }, done ? `Payout released to ${name}${early}. All sahod released!` : `Payout released to ${name}${early}`);
  });
}

export function deleteManagedCircle(id: string) {
  commit(state.filter((c) => c.id !== id));
}

// ---------------------------------------------------------------- derived helpers
export const isManagedId = (id?: string) => !!id && id.startsWith('local-');

/** Hulog dates per payout (first round), for display. */
export function hulogPerPayout(c: Pick<LocalCircle, 'frequency' | 'interval_days' | 'start_date' | 'payout' | 'rounds'>): number {
  return c.rounds?.[0]?.dates.length ?? payoutPlan(c, c.payout ?? null, 1)[0].dates.length;
}

/** Pot for a payout round (or the first one). */
export function potOfManaged(c: LocalCircle, r?: LocalRound): number {
  return c.amount * c.members.length * (r ? r.dates.length : hulogPerPayout(c));
}

export const paidOn = (r: LocalRound, date: string) => Object.keys(r.paid[date] ?? {}).length;

/** Total collected so far for a round. */
export const collected = (c: LocalCircle, r: LocalRound) => r.dates.reduce((s, d) => s + paidOn(r, d), 0) * c.amount;

/** The hulog date to focus on in a round: today, else the earliest unpaid past date, else the next date. */
export function focusDate(c: LocalCircle, r: LocalRound): string {
  const today = todayISO();
  if (r.dates.includes(today)) return today;
  const n = c.members.length;
  return r.dates.find((d) => d < today && paidOn(r, d) < n) ?? r.dates.find((d) => d > today) ?? r.dates[r.dates.length - 1];
}

/** Today's hulog date, in whichever payout round it belongs to (even one already released early). */
export function hulogToday(c: LocalCircle): HulogDay | null {
  const today = todayISO();
  return hulogDays(c).find((d) => d.date === today) ?? null;
}

/** The next hulog date after today, if any. */
export function nextHulog(c: LocalCircle): HulogDay | null {
  const today = todayISO();
  return hulogDays(c).find((d) => d.date > today) ?? null;
}

/** True when a sahod was released before its scheduled date. */
export const releasedEarly = (r: LocalRound) => !!r.payout_at && r.payout_at.slice(0, 10) < r.due_date;

export function managedSummary(c: LocalCircle) {
  const current = c.rounds.find((r) => r.status === 'active');
  const date = current ? focusDate(c, current) : undefined;
  const paidCount = current && date ? paidOn(current, date) : 0;
  const completed = c.rounds.filter((r) => r.status === 'completed').length;
  const today = todayISO();
  const n = c.members.length;
  const overdue = current ? current.dates.some((d) => d < today && paidOn(current, d) < n) : false;
  return { current, date, paidCount, completed, overdue, recipient: c.members.find((m) => m.id === current?.member_id) };
}

// ---------------------------------------------------------------- date history / missed payments

/** Amount still missing for one hulog date. */
export const dateShort = (c: LocalCircle, r: LocalRound, date: string) => Math.max(0, c.members.length - paidOn(r, date)) * c.amount;

/** Amount still missing across a whole round. */
export const roundShort = (c: LocalCircle, r: LocalRound) => r.dates.reduce((s, d) => s + dateShort(c, r, d), 0);

/** True when a payment was recorded after its hulog date (+ grace). */
export function paidLate(c: LocalCircle, date: string, at: string | undefined): boolean {
  if (!at || at === 'recipient') return false;
  const due = parseDate(date);
  due.setDate(due.getDate() + c.grace_days);
  return at.slice(0, 10) > toISODate(due);
}

export type HulogDay = { date: string; round: LocalRound };

/** Every hulog date in the circle, in order, with its payout round. */
export const hulogDays = (c: LocalCircle): HulogDay[] => c.rounds.flatMap((round) => round.dates.map((date) => ({ date, round })));

export type MissedBalance = { member: LocalMember; days: HulogDay[]; owed: number };

/** Members who haven't paid for past hulog dates (before today), most owed first. */
export function missedPayments(c: LocalCircle): MissedBalance[] {
  const today = todayISO();
  const past = hulogDays(c).filter((d) => d.date < today);
  return c.members
    .map((member) => {
      const days = past.filter((d) => !d.round.paid[d.date]?.[member.id]);
      return { member, days, owed: days.length * c.amount };
    })
    .filter((b) => b.days.length > 0)
    .sort((a, b) => b.owed - a.owed);
}
