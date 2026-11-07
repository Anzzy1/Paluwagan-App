/**
 * Ipon's reactions: short messages that drop down from the top of the screen
 * whenever a contribution is added (ipon deposit, payment receipt, member marked paid…).
 */
import { useSyncExternalStore } from 'react';

import type { MascotAction } from '@/components/AnimatedMascot';
import type { MascotMood, MascotPose } from '@/components/Mascot';
import { peso } from '@/lib/format';

export type Reaction = { id: number; mood: MascotMood; pose: MascotPose; action: MascotAction; title: string; text: string };

let current: Reaction | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showReaction(r: Omit<Reaction, 'id'>) {
  current = { ...r, id: ++seq };
  emit();
}
export function dismissReaction(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  emit();
}
export function useReaction(): Reaction | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

// ---------------------------------------------------------------- ipon goals

export function reactToDeposit(goal: string, amount: number, before: number, target: number) {
  const after = Math.max(0, before + amount);
  const left = Math.max(0, target - after);
  const pct = target > 0 ? Math.min(100, Math.round((after / target) * 100)) : 0;

  if (amount < 0) {
    return showReaction({
      mood: 'worried',
      pose: 'coin',
      action: 'wave',
      title: 'Withdrawal noted',
      text: pick([
        `You took out ${peso(-amount)} from ${goal}. That's okay, life happens. Let's build it back up: ${peso(left)} to go.`,
        `${peso(-amount)} out of ${goal}. No stress, just add a little extra on your next payday.`,
      ]),
    });
  }
  if (target > 0 && after >= target && before < target) {
    return showReaction({ mood: 'excited', pose: 'cheer', action: 'cheer', title: 'Goal reached!', text: `You did it! ${goal} is fully funded at ${peso(target)}. I'm so proud of you!` });
  }
  const crossed = [75, 50, 25].find((m) => before < (target * m) / 100 && after >= (target * m) / 100);
  if (crossed) {
    const label = crossed === 50 ? 'Halfway there!' : crossed === 75 ? 'Almost there!' : 'Great start!';
    return showReaction({ mood: 'excited', pose: 'cheer', action: 'cheer', title: label, text: `${pct}% of ${goal} saved. Only ${peso(left)} left. Keep it going!` });
  }
  showReaction({
    mood: 'happy',
    pose: 'coin',
    action: 'toss',
    title: pick(['Nice hulog!', 'Ka-ching!', 'Stored for later!', 'Another one in!']),
    text: pick([
      `${peso(amount)} added to ${goal}. You're at ${pct}%, ${peso(left)} to go.`,
      `I tucked ${peso(amount)} away for ${goal}. ${peso(left)} more and it's yours.`,
      `${peso(amount)} saved! ${goal} is now ${pct}% done.`,
    ]),
  });
}

// ---------------------------------------------------------------- online circles

export function reactToPayment(circle: string, amount: number, late: boolean) {
  showReaction(
    late
      ? {
          mood: 'neutral',
          pose: 'coin',
          action: 'toss',
          title: 'Receipt sent',
          text: `${peso(amount)} for ${circle} is in, a little late but done. The recipient will confirm it soon. Try to pay early next round!`,
        }
      : {
          mood: 'excited',
          pose: 'cheer',
          action: 'cheer',
          title: pick(['Paid on time!', 'Hulog sent!', 'Receipt sent!']),
          text: pick([
            `${peso(amount)} for ${circle} is on its way. On-time payments grow your Trust Score.`,
            `Nice! Your ${peso(amount)} for ${circle} is waiting for confirmation. Keep your streak going!`,
          ]),
        },
  );
}

// ---------------------------------------------------------------- managed (offline) circles

export function reactToMarkPaid(member: string, paid: number, total: number, round: number, recipient: string, pot: number) {
  if (paid >= total) {
    return showReaction({ mood: 'excited', pose: 'cheer', action: 'cheer', title: 'Everyone paid!', text: `All ${total} members are in for round ${round}. Ready to release ${peso(pot)} to ${recipient}.` });
  }
  showReaction({
    mood: 'happy',
    pose: 'coin',
    action: 'toss',
    title: `${member} paid!`,
    text: `${paid} of ${total} members are in for round ${round}. ${total - paid} more to go.`,
  });
}

export function reactToPayout(recipient: string, pot: number, nextRound: number | null) {
  showReaction({
    mood: 'excited',
    pose: 'cheer',
    action: 'cheer',
    title: 'Payout released!',
    text: nextRound ? `${peso(pot)} handed to ${recipient}. On to round ${nextRound}!` : `${peso(pot)} handed to ${recipient}. That was the last round. Circle complete!`,
  });
}

/** A payment recorded for a past date (back-filling a missed day). */
export function reactToBackfill(member: string, date: string, roundLeft: number, totalLeft: number) {
  if (roundLeft <= 0) {
    return showReaction({
      mood: 'excited',
      pose: 'cheer',
      action: 'cheer',
      title: `${date} is fully funded!`,
      text: totalLeft > 0 ? `Got ${member}'s payment. ${peso(totalLeft)} is still unpaid on other dates.` : `Got ${member}'s payment. Everyone is caught up on past dates!`,
    });
  }
  showReaction({
    mood: 'happy',
    pose: 'coin',
    action: 'toss',
    title: `${member} caught up!`,
    text: `Recorded ${member}'s payment for ${date}. ${peso(roundLeft)} is still missing that day.`,
  });
}
