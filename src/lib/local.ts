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

/** A sahod change the organiser can undo. */
export type SahodAction =
  | { kind: 'release'; round_no: number; at: string; early: boolean }
  | { kind: 'delay'; at: string; changes: { round_no: number; from: string; to: string }[] };

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
  /** Sahod actions that can be undone, most recent last. */
  sahod_history?: SahodAction[];
  /** Date (YYYY-MM-DD) the paluwagan was paused, or null while running. */
  paused_at?: string | null;
  pause_reason?: string | null;
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
    sahod_history: c.sahod_history ?? [],
    paused_at: c.paused_at ?? null,
    pause_reason: c.pause_reason ?? null,
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
    const history = [...(c.sahod_history ?? []), { kind: 'release' as const, round_no: roundNo, at: new Date().toISOString(), early: !!early }];
    const next = c.members.find((m) => m.id === rounds.find((r) => r.status === 'active')?.member_id)?.name;
    return log(
      { ...c, rounds, sahod_history: history, status: done ? 'completed' : c.status },
      done ? `Payout released to ${name}${early}. All sahod released!` : `Payout released to ${name}${early}. Next sahod: ${next ?? 'next member'}`,
    );
  });
}

/**
 * Move a sahod to a later date. With `shiftLater`, every later sahod moves by the same
 * number of days so the order and spacing stay the same. Hulog dates don't change.
 */
export function delaySahod(id: string, roundNo: number, newDate: string, shiftLater: boolean) {
  update(id, (c) => {
    const round = c.rounds.find((r) => r.round_no === roundNo);
    if (!round || newDate <= round.due_date) return c;
    const days = Math.round((parseDate(newDate).getTime() - parseDate(round.due_date).getTime()) / 86_400_000);
    const changes: { round_no: number; from: string; to: string }[] = [];
    const rounds = c.rounds.map((r) => {
      let to: string | null = null;
      if (r.round_no === roundNo) to = newDate;
      else if (shiftLater && r.round_no > roundNo && r.status !== 'completed') {
        const d = parseDate(r.due_date);
        d.setDate(d.getDate() + days);
        to = toISODate(d);
      }
      if (!to) return r;
      changes.push({ round_no: r.round_no, from: r.due_date, to });
      return { ...r, due_date: to };
    });
    const name = c.members.find((m) => m.id === round.member_id)?.name ?? 'Member';
    return log(
      { ...c, rounds, sahod_history: [...(c.sahod_history ?? []), { kind: 'delay', at: new Date().toISOString(), changes }] },
      `${name}’s sahod moved from ${shortDate(round.due_date)} to ${shortDate(newDate)}${shiftLater && changes.length > 1 ? `, later sahod moved ${days} day${days === 1 ? '' : 's'} too` : ''}`,
    );
  });
}

/** Describe the most recent undoable sahod action, if any. */
export function lastSahodAction(c: LocalCircle): { action: SahodAction; text: string } | null {
  const action = c.sahod_history?.[c.sahod_history.length - 1];
  if (!action) return null;
  const nameOf = (roundNo: number) => c.members.find((m) => m.id === c.rounds.find((r) => r.round_no === roundNo)?.member_id)?.name ?? 'Member';
  if (action.kind === 'release') return { action, text: `${action.early ? 'Advance sahod' : 'Sahod'} released to ${nameOf(action.round_no)}` };
  const first = action.changes[0];
  return { action, text: first ? `${nameOf(first.round_no)}’s sahod moved to ${shortDate(first.to)}` : 'Sahod moved' };
}

/**
 * Undo the most recent sahod action. A release goes back to "not yet released" (that member
 * is next again); a delay puts the dates back. Hulog payments recorded since are kept.
 */
export function undoSahod(id: string) {
  update(id, (c) => {
    const last = lastSahodAction(c);
    if (!last) return c;
    const history = (c.sahod_history ?? []).slice(0, -1);
    const { action } = last;
    if (action.kind === 'release') {
      const rounds = c.rounds.map((r) => {
        if (r.round_no === action.round_no) return { ...r, status: 'active' as const, payout_at: null };
        if (r.round_no > action.round_no && r.status === 'active') return { ...r, status: 'upcoming' as const };
        return r;
      });
      return log({ ...c, rounds, status: 'active', sahod_history: history }, `Undone: ${last.text}`);
    }
    const back = new Map(action.changes.map((x) => [x.round_no, x.from]));
    const rounds = c.rounds.map((r) => (back.has(r.round_no) ? { ...r, due_date: back.get(r.round_no)! } : r));
    return log({ ...c, rounds, sahod_history: history }, `Undone: ${last.text}`);
  });
}

// ---------------------------------------------------------------- pause / resume

const plusDays = (d: string, n: number) => {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toISODate(x);
};
const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

/** Pause a running paluwagan: hulog and sahod stop until it's resumed. */
export function pauseManaged(id: string, reason: string) {
  update(id, (c) => {
    if (c.status !== 'active' || c.paused_at) return c;
    const why = reason.trim();
    return log({ ...c, paused_at: todayISO(), pause_reason: why || null }, `Paluwagan paused${why ? `: ${why}` : ''}`);
  });
}

/**
 * What a pause affects: hulog dates from the pause day on that nobody has paid yet,
 * and sahod not yet released that fall on or after the pause day.
 * `anchor` = the first of those dates (the one a "restart date" lines up with).
 */
export function pauseInfo(c: LocalCircle) {
  const from = c.paused_at ?? todayISO();
  const hulog = hulogDays(c).filter((d) => d.date >= from && paidOn(d.round, d.date) === 0);
  const sahod = c.rounds.filter((r) => r.status !== 'completed' && r.due_date >= from);
  const anchor = [hulog[0]?.date, sahod[0]?.due_date].filter(Boolean).sort()[0] ?? null;
  return { from, pausedDays: Math.max(0, daysBetween(from, todayISO())), anchor, hulog, sahod };
}

/** Rounds with every affected date moved by `shift` days (see pauseInfo). */
function shiftAfterPause(c: LocalCircle, shift: number): LocalRound[] {
  if (!shift) return c.rounds;
  const from = c.paused_at ?? todayISO();
  return c.rounds.map((r) => {
    const moved = new Map<string, string>();
    for (const d of r.dates) if (d >= from && paidOn(r, d) === 0) moved.set(d, plusDays(d, shift));
    const dates = r.dates.map((d) => moved.get(d) ?? d).sort();
    const paid = Object.fromEntries(Object.entries(r.paid).map(([d, day]) => [moved.get(d) ?? d, day]));
    const due_date = r.status !== 'completed' && r.due_date >= from ? plusDays(r.due_date, shift) : r.due_date;
    return { ...r, dates, paid, due_date };
  });
}

/** Before/after of the key dates if the paluwagan resumes with `shift` days. */
export function resumePreview(c: LocalCircle, shift: number) {
  const rounds = shiftAfterPause(c, shift);
  const info = pauseInfo(c);
  const after = { ...c, rounds };
  const nameOf = (r?: LocalRound) => c.members.find((m) => m.id === r?.member_id)?.name ?? 'Member';
  const firstHulog = info.hulog[0];
  const nextSahod = info.sahod[0];
  const last = c.rounds[c.rounds.length - 1];
  return {
    hulog: firstHulog ? { from: firstHulog.date, to: firstHulog.date >= info.from ? plusDays(firstHulog.date, shift) : firstHulog.date } : null,
    sahod: nextSahod ? { name: nameOf(nextSahod), from: nextSahod.due_date, to: rounds.find((r) => r.round_no === nextSahod.round_no)!.due_date } : null,
    end: last ? { from: last.due_date, to: rounds[rounds.length - 1].due_date } : null,
    /** Hulog dates that would end up in the past (counted as missed) after resuming. */
    missedAfter: hulogDays(after).filter((d) => d.date >= info.from && d.date < todayISO() && paidOn(d.round, d.date) === 0).length,
  };
}

/** Resume a paused paluwagan, moving every affected hulog and sahod date by `shift` days (0 = keep dates). */
export function resumeManaged(id: string, shift: number) {
  update(id, (c) => {
    if (!c.paused_at) return c;
    const rounds = shiftAfterPause(c, shift);
    const days = Math.abs(shift);
    const how = shift > 0 ? `dates moved ${days} day${days === 1 ? '' : 's'} later` : shift < 0 ? `dates moved ${days} day${days === 1 ? '' : 's'} earlier` : 'dates kept';
    return log({ ...c, rounds, paused_at: null, pause_reason: null }, `Paluwagan resumed, ${how}`);
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

/** True for dates on/after the pause day while paused: they'll move when it resumes. */
export const isPausedDate = (c: LocalCircle, date: string) => !!c.paused_at && date >= c.paused_at;

/** Every hulog date in the circle, in order, with its payout round. */
export const hulogDays = (c: LocalCircle): HulogDay[] => c.rounds.flatMap((round) => round.dates.map((date) => ({ date, round })));

export type MissedBalance = { member: LocalMember; days: HulogDay[]; owed: number };

/** Members who haven't paid for past hulog dates (before today), most owed first. */
export function missedPayments(c: LocalCircle): MissedBalance[] {
  const today = todayISO();
  const past = hulogDays(c).filter((d) => d.date < today && !isPausedDate(c, d.date));
  return c.members
    .map((member) => {
      const days = past.filter((d) => !d.round.paid[d.date]?.[member.id]);
      return { member, days, owed: days.length * c.amount };
    })
    .filter((b) => b.days.length > 0)
    .sort((a, b) => b.owed - a.owed);
}
