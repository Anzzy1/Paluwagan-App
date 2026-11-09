import type { MyCircle } from '@/lib/api';
import { payoutPlan } from '@/lib/local';
import { daysUntil, potOf } from '@/lib/format';
import type { Circle, CirclePreview, Contribution, Member, Round } from '@/lib/types';

export function currentRound(rounds: Round[]): Round | undefined {
  return rounds.find((r) => r.status === 'active');
}

export function myRoundOf(rounds: Round[], slotGroup: string): Round | undefined {
  return rounds.find((r) => r.slot_group === slotGroup);
}

/** A contribution's own hulog date (older circles: the round's date). */
export const dueOf = (k: Pick<Contribution, 'due_date'>, round: Pick<Round, 'due_date'>) => k.due_date ?? round.due_date;

/** My unpaid (non-auto) contributions, soonest first. Includes overdue ones from released rounds. */
export function unpaid(contributions: Contribution[], rounds: Round[]) {
  const byId = new Map(rounds.map((r) => [r.id, r]));
  return contributions
    .filter((k) => !k.auto && (k.status === 'pending' || k.status === 'rejected'))
    .map((k) => ({ k, round: byId.get(k.round_id)! }))
    .filter((x) => x.round)
    .map((x) => ({ ...x, due: dueOf(x.k, x.round) }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** Hulog per payout round: how many contributions each member makes before one sahod. */
export function hulogInRound(contributions: Contribution[], round: Round | undefined, memberId?: string): number {
  if (!round) return 1;
  const ks = contributions.filter((k) => k.round_id === round.id && (!memberId || k.member_id === memberId));
  return Math.max(1, new Set(ks.map((k) => dueOf(k, round))).size);
}

/** My contribution to act on in a round: the earliest unpaid hulog, else one awaiting review, else the last one. */
export function myNextContribution(contributions: Contribution[], round: Round | undefined, memberId: string | undefined) {
  if (!round || !memberId) return undefined;
  const mine = contributions.filter((k) => k.round_id === round.id && k.member_id === memberId).sort((a, b) => dueOf(a, round).localeCompare(dueOf(b, round)));
  return mine.find((k) => k.status === 'pending' || k.status === 'rejected') ?? mine.find((k) => k.status === 'submitted') ?? mine[mine.length - 1];
}

export type CircleSummary = {
  pot: number;
  myPayout: number;
  myRound?: Round;
  current?: Round;
  roundsAway: number | null; // 0 = my round is active
  completedRounds: number;
  nextDue?: { k: Contribution; round: Round };
  paidIn: number;
};

export function summarize(mc: MyCircle): CircleSummary {
  const pot = potOf(mc.circle);
  const myRound = myRoundOf(mc.rounds, mc.membership.slot_group);
  const current = currentRound(mc.rounds);
  const roundsAway =
    myRound && myRound.status !== 'completed' ? myRound.round_no - (current?.round_no ?? myRound.round_no) : null;
  const due = unpaid(mc.contributions, mc.rounds);
  // My own contributions in my round = number of hulog dates per sahod.
  const perRound = hulogInRound(mc.contributions, myRound ?? current);
  return {
    pot: pot * perRound,
    myPayout: pot * perRound * Number(mc.membership.share),
    myRound,
    current,
    roundsAway,
    completedRounds: mc.rounds.filter((r) => r.status === 'completed').length,
    nextDue: due[0],
    paidIn: mc.contributions
      .filter((k) => k.status === 'confirmed' && !k.auto)
      .reduce((s, k) => s + Number(k.amount), 0),
  };
}

/** The soonest upcoming payout across all circles. */
export function nextPayout(circles: MyCircle[]) {
  return circles
    .map((mc) => ({ mc, s: summarize(mc) }))
    .filter((x) => x.s.myRound && x.s.myRound.status !== 'completed')
    .sort((a, b) => a.s.myRound!.due_date.localeCompare(b.s.myRound!.due_date))[0];
}

export function recipientsOf(round: Round | undefined, members: Member[]) {
  if (!round) return [];
  return members.filter((m) => m.slot_group === round.slot_group && m.status === 'approved');
}

export function isOverdue(due: string, graceDays: number) {
  return daysUntil(due) < -graceDays;
}

type SahodFields = Pick<Circle, 'frequency' | 'interval_days' | 'start_date' | 'payout_frequency' | 'payout_interval_days' | 'first_payout_date'>;

/** Hulog dates in the first sahod, from the circle's schedules (used before rounds exist). */
export function plannedHulogPerSahod(c: SahodFields | CirclePreview): number {
  const payout = c.payout_frequency && c.first_payout_date ? { frequency: c.payout_frequency, interval_days: c.payout_interval_days, first_date: c.first_payout_date } : null;
  return payoutPlan({ frequency: c.frequency, interval_days: c.interval_days, start_date: c.start_date }, payout, 1)[0].dates.length;
}
