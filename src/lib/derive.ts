import type { MyCircle } from '@/lib/api';
import { daysUntil, potOf } from '@/lib/format';
import type { Contribution, Member, Round } from '@/lib/types';

export function currentRound(rounds: Round[]): Round | undefined {
  return rounds.find((r) => r.status === 'active');
}

export function myRoundOf(rounds: Round[], slotGroup: string): Round | undefined {
  return rounds.find((r) => r.slot_group === slotGroup);
}

/** My unpaid (non-auto) contributions, soonest first. */
export function unpaid(contributions: Contribution[], rounds: Round[]) {
  const byId = new Map(rounds.map((r) => [r.id, r]));
  return contributions
    .filter((k) => !k.auto && (k.status === 'pending' || k.status === 'rejected'))
    .map((k) => ({ k, round: byId.get(k.round_id)! }))
    .filter((x) => x.round && x.round.status !== 'completed')
    .sort((a, b) => a.round.due_date.localeCompare(b.round.due_date));
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
  return {
    pot,
    myPayout: pot * Number(mc.membership.share),
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

export function isOverdue(round: Round, graceDays: number) {
  return daysUntil(round.due_date) < -graceDays;
}
