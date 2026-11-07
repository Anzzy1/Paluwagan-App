/**
 * Ipon (personal savings) math: how much is saved per goal, how much the plan needs,
 * and whether the user is on track for their target date.
 */
import type { MyCircle } from '@/lib/api';
import { summarize } from '@/lib/derive';
import { daysUntil, parseDate, toISODate, todayISO } from '@/lib/format';
import type { Deposit, Goal, PlanFrequency } from '@/lib/types';

export const planLabel: Record<PlanFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  kinsenas: 'Payday',
  monthly: 'Monthly',
};
export const planPer: Record<PlanFrequency, string> = {
  daily: 'a day',
  weekly: 'a week',
  kinsenas: 'every payday',
  monthly: 'a month',
};
const DAYS_PER: Record<PlanFrequency, number> = { daily: 1, weekly: 7, kinsenas: 15.2, monthly: 30.4 };

export type GoalProgress = {
  goal: Goal;
  deposits: Deposit[];
  /** Saved by the user directly (deposits − withdrawals). */
  ipon: number;
  /** Paid into the linked circle so far. */
  fromCircle: number;
  circleName: string | null;
  saved: number;
  remaining: number;
  progress: number;
  /** Amount per period needed to hit the deadline (null without a deadline). */
  needed: number | null;
  periodsLeft: number | null;
  daysLeft: number | null;
  status: 'done' | 'on-track' | 'behind' | 'no-plan' | 'overdue';
  /** Saved in the current period (week / month / …) for the plan. */
  thisPeriod: number;
};

function periodStart(freq: PlanFrequency): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (freq === 'weekly') d.setDate(d.getDate() - d.getDay());
  if (freq === 'monthly') d.setDate(1);
  if (freq === 'kinsenas') d.setDate(d.getDate() > 15 ? 16 : 1);
  return d;
}

export function goalProgress(goal: Goal, allDeposits: Deposit[], circles: MyCircle[]): GoalProgress {
  const deposits = allDeposits.filter((d) => d.goal_id === goal.id);
  const ipon = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const mc = circles.find((x) => x.circle.id === goal.circle_id);
  const fromCircle = mc ? summarize(mc).paidIn : 0;
  const saved = Math.max(0, ipon + fromCircle);
  const target = Number(goal.target);
  const remaining = Math.max(0, target - saved);
  const freq = goal.plan_frequency ?? 'weekly';

  let daysLeft: number | null = null;
  let periodsLeft: number | null = null;
  let needed: number | null = null;
  if (goal.deadline) {
    daysLeft = daysUntil(goal.deadline);
    periodsLeft = Math.max(1, Math.ceil(Math.max(daysLeft, 0) / DAYS_PER[freq]));
    needed = remaining > 0 ? Math.ceil(remaining / periodsLeft) : 0;
  }

  const start = periodStart(freq).getTime();
  const thisPeriod = deposits.filter((d) => new Date(d.created_at).getTime() >= start && d.amount > 0).reduce((s, d) => s + Number(d.amount), 0);

  let status: GoalProgress['status'] = 'no-plan';
  if (remaining <= 0) status = 'done';
  else if (daysLeft !== null && daysLeft < 0) status = 'overdue';
  else if (needed !== null && goal.plan_amount) status = Number(goal.plan_amount) >= needed ? 'on-track' : 'behind';
  else if (goal.plan_amount) status = 'on-track';

  return {
    goal,
    deposits,
    ipon,
    fromCircle,
    circleName: mc?.circle.name ?? null,
    saved,
    remaining,
    progress: target > 0 ? Math.min(1, saved / target) : 0,
    needed,
    periodsLeft,
    daysLeft,
    status,
    thisPeriod,
  };
}

/** Consecutive weeks (ending this week or last) with at least one deposit. */
export function iponStreak(deposits: Deposit[]): number {
  const weekKey = (d: Date) => {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    return toISODate(s);
  };
  const weeks = new Set(deposits.filter((d) => d.amount > 0).map((d) => weekKey(new Date(d.created_at))));
  const cursor = new Date();
  if (!weeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
  let n = 0;
  while (weeks.has(weekKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return n;
}

/** Date the goal would be reached at the current plan amount. */
export function projectedFinish(p: GoalProgress): string | null {
  const amt = Number(p.goal.plan_amount);
  if (!amt || p.remaining <= 0) return null;
  const periods = Math.ceil(p.remaining / amt);
  const d = parseDate(todayISO());
  d.setDate(d.getDate() + Math.round(periods * DAYS_PER[p.goal.plan_frequency ?? 'weekly']));
  return toISODate(d);
}
