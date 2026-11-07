import type { IconName } from '@/components/ui/bits';
import type { MyCircle } from '@/lib/api';
import { daysUntil, peso } from '@/lib/format';
import { summarize, unpaid } from '@/lib/derive';
import type { MascotMood, MascotPose } from '@/components/Mascot';
import type { Profile } from '@/lib/types';

/** Consecutive on-time contributions, most recent first. */
export function onTimeStreak(circles: MyCircle[]): number {
  const paid = circles
    .flatMap((mc) => mc.contributions)
    .filter((k) => k.status === 'confirmed' && !k.auto && k.on_time !== null)
    .sort((a, b) => (b.submitted_at ?? b.confirmed_at ?? '').localeCompare(a.submitted_at ?? a.confirmed_at ?? ''));
  let n = 0;
  for (const k of paid) {
    if (!k.on_time) break;
    n++;
  }
  return n;
}

export type Badge = { id: string; title: string; body: string; icon: IconName; color: string; earned: boolean };

export function badgesFor(circles: MyCircle[], profile: Profile | null): Badge[] {
  const paid = circles.flatMap((mc) => mc.contributions.filter((k) => k.status === 'confirmed' && !k.auto));
  const onTime = paid.filter((k) => k.on_time).length;
  const streak = onTimeStreak(circles);
  const admin = circles.some((mc) => mc.membership.role === 'admin');
  const payout = circles.some((mc) => mc.rounds.some((r) => r.slot_group === mc.membership.slot_group && r.status === 'completed'));
  const finished = circles.some((mc) => mc.circle.status === 'completed');
  return [
    { id: 'first', title: 'First Hulog', body: 'Make your first contribution', icon: 'check', color: '#16A34A', earned: paid.length >= 1 },
    { id: 'streak3', title: 'On a Roll', body: '3 on-time payments in a row', icon: 'zap', color: '#F2711C', earned: streak >= 3 },
    { id: 'ontime10', title: 'Always On Time', body: '10 on-time payments', icon: 'clock', color: '#2F6FEB', earned: onTime >= 10 },
    { id: 'starter', title: 'Circle Starter', body: 'Create your own circle', icon: 'plus-circle', color: '#7350E8', earned: admin },
    { id: 'payout', title: 'Payday!', body: 'Receive your first payout', icon: 'gift', color: '#E5365F', earned: payout },
    { id: 'trusted', title: 'Trusted', body: 'Reach a Trust Score of 90', icon: 'shield', color: '#D9961A', earned: (profile?.tiwala_score ?? 0) >= 90 },
    { id: 'social', title: 'Barkada Builder', body: 'Join 3 circles', icon: 'users', color: '#16A34A', earned: circles.length >= 3 },
    { id: 'finisher', title: 'Finisher', body: 'Complete a whole circle', icon: 'flag', color: '#13201B', earned: finished },
  ];
}

export type Tip = { mood: MascotMood; pose: MascotPose; text: string; cta?: { label: string; href: string } };

/** What Ipon says on the home screen — the most important thing first. */
export function homeTip(circles: MyCircle[], firstName: string): Tip {
  if (!circles.length) {
    return {
      mood: 'happy',
      pose: 'coin',
      text: `Hi ${firstName}! I’m Ipon. Start a circle with people you trust, and I’ll keep everyone on track.`,
      cta: { label: 'Create a circle', href: '/create' },
    };
  }
  const dues = circles
    .flatMap((mc) => unpaid(mc.contributions, mc.rounds).map((x) => ({ ...x, mc })))
    .sort((a, b) => a.due.localeCompare(b.due));
  const overdue = dues.find((d) => daysUntil(d.due) < -d.mc.circle.grace_days);
  if (overdue) {
    return {
      mood: 'worried',
      pose: 'coin',
      text: `Uh-oh! Your ${peso(overdue.k.amount)} for ${overdue.mc.circle.name} is overdue. Pay now to protect your streak.`,
      cta: { label: 'Pay now', href: `/circle/${overdue.mc.circle.id}/round/${overdue.round.id}` },
    };
  }
  const myTurn = circles.find((mc) => summarize(mc).roundsAway === 0);
  if (myTurn) {
    const s = summarize(myTurn);
    return {
      mood: 'excited',
      pose: 'cheer',
      text: `It’s your payout round in ${myTurn.circle.name}! ${peso(s.myPayout)} is coming your way.`,
      cta: { label: 'View payments', href: `/circle/${myTurn.circle.id}` },
    };
  }
  const soon = dues.find((d) => daysUntil(d.due) <= 3);
  if (soon) {
    const n = daysUntil(soon.due);
    return {
      mood: 'happy',
      pose: 'coin',
      text: `Heads up! ${peso(soon.k.amount)} for ${soon.mc.circle.name} is due ${n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}.`,
      cta: { label: 'Pay now', href: `/circle/${soon.mc.circle.id}/round/${soon.round.id}` },
    };
  }
  const streak = onTimeStreak(circles);
  return {
    mood: 'happy',
    pose: 'coin',
    text: streak > 0 ? `You’re all caught up with a ${streak}-payment streak. Keep it going!` : 'You’re all caught up. Nothing due right now. Nice!',
  };
}
