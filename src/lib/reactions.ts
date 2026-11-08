/**
 * Ipon's reactions: short messages that drop down from the top of the screen
 * when something worth celebrating happens (ipon deposit, payment receipt, a hulog day completed…).
 */
import type { Href } from 'expo-router';
import { useSyncExternalStore } from 'react';

import type { MascotAction } from '@/components/AnimatedMascot';
import type { MascotMood, MascotPose } from '@/components/Mascot';
import { longDate, peso, shortDate } from '@/lib/format';
import { pushNotice } from '@/lib/notices';

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

type CircleRef = { id: string; name: string };

/** Note a completed hulog day in Notifications (replaces an earlier reminder for that day). */
function noteComplete(c: CircleRef, date: string, total: number, amount: number) {
  pushNotice({
    id: `hulog-${c.id}-${date}`,
    tone: 'success',
    icon: 'check-circle',
    text: `Hulog complete for ${longDate(date)}: all ${total} members paid, ${peso(total * amount)} collected.`,
    circle: c.name,
    href: `/managed/${c.id}` as Href,
  });
}

/**
 * Called after a member is marked paid for today. Stays quiet while people are still
 * being checked off (no spam), and only reacts once the whole day is complete.
 */
export function reactToMarkPaid(c: CircleRef, date: string, paid: number, total: number, amount: number, nextSahod: string | null) {
  if (paid < total) return;
  noteComplete(c, date, total, amount);
  showReaction({
    mood: 'excited',
    pose: 'cheer',
    action: 'cheer',
    title: 'Today’s hulog is complete!',
    text: `All ${total} members paid, ${peso(total * amount)} collected.${nextSahod ? ` Next sahod: ${nextSahod}.` : ''}`,
  });
}

export function reactToPayout(recipient: string, pot: number, nextRound: number | null) {
  showReaction({
    mood: 'excited',
    pose: 'cheer',
    action: 'cheer',
    title: 'Payout released!',
    text: nextRound ? `${peso(pot)} handed to ${recipient}. On to round ${nextRound}!` : `${peso(pot)} handed to ${recipient}. That was the last round. Paluwagan complete!`,
  });
}

/** A payment recorded for a past date (back-filling a missed day). Only reacts once that date is complete. */
export function reactToBackfill(c: CircleRef, date: string, paid: number, total: number, amount: number, otherMissing: number) {
  if (paid < total) return;
  noteComplete(c, date, total, amount);
  showReaction({
    mood: 'excited',
    pose: 'cheer',
    action: 'cheer',
    title: `${shortDate(date)} is complete!`,
    text: otherMissing > 0 ? `Everyone has paid for that date. ${peso(otherMissing)} is still unpaid on other dates.` : 'Everyone is caught up on past dates!',
  });
}
