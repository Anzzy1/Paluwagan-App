/**
 * Ipon AI — client side.
 *
 * Builds a compact text snapshot of the user's own data (circles, dues, ipon goals,
 * deposits, activity) and sends it with each request to the `ai` Edge Function,
 * which calls Claude with the server-side API key.
 */
import { useMutation } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { useActivity, useDeposits, useGoals, useMyCircles } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { describeActivity } from '@/lib/activityText';
import { demoState } from '@/lib/demo';
import { summarize, unpaid } from '@/lib/derive';
import { daysUntil, payoutShort, pesoRaw as peso } from '@/lib/format';
import { goalProgress, iponStreak, planPer } from '@/lib/ipon';
import { managedSummary, potOfManaged, useManagedCircles } from '@/lib/local';
import { onTimeStreak } from '@/lib/rewards';
import { kv } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { PlanFrequency } from '@/lib/types';

// ---------------------------------------------------------------- context snapshot

/** Plain-text snapshot of everything Ipon may use to answer. */
export function useAiContext(): string {
  const { profile } = useAuth();
  const circles = useMyCircles().data ?? [];
  const goals = useGoals().data ?? [];
  const deposits = useDeposits().data ?? [];
  const activity = useActivity().data ?? [];
  const managed = useManagedCircles();

  const lines: string[] = [];
  lines.push(`Name: ${profile?.full_name ?? 'Guest'} · Trust Score ${profile?.tiwala_score ?? '—'} · on-time payment streak ${onTimeStreak(circles)}`);

  lines.push('', `PALUWAGAN CIRCLES (${circles.length}):`);
  for (const mc of circles) {
    const s = summarize(mc);
    const c = mc.circle;
    const payout = s.myRound ? `my payout ${peso(s.myPayout)} in round ${s.myRound.round_no} on ${s.myRound.due_date}${s.roundsAway === 0 ? ' (THIS ROUND)' : s.roundsAway != null ? ` (${s.roundsAway} rounds away)` : ' (received)'}` : 'payout order not drawn yet';
    lines.push(`- ${c.name}: ${peso(c.amount)} ${payoutShort(c).toLowerCase()}, ${c.slots} slots, status ${c.status}, role ${mc.membership.role}; ${payout}; I have paid in ${peso(s.paidIn)}; ${s.completedRounds}/${mc.rounds.length} rounds done`);
  }
  for (const m of managed) {
    const s = managedSummary(m);
    lines.push(`- ${m.name} (offline circle I organise): ${peso(m.amount)} ${payoutShort(m).toLowerCase()}, ${m.members.length} members, pot ${peso(potOfManaged(m))}, status ${m.status}${s.current ? `, round ${s.current.round_no} due ${s.current.due_date}, ${s.paidCount}/${m.members.length} paid, recipient ${s.recipient?.name ?? '—'}` : ''}${s.overdue ? ' (OVERDUE)' : ''}`);
  }

  const dues = circles
    .flatMap((mc) => unpaid(mc.contributions, mc.rounds).map((x) => ({ ...x, mc })))
    .sort((a, b) => a.due.localeCompare(b.due));
  lines.push('', `UNPAID CONTRIBUTIONS (${dues.length}, total ${peso(dues.reduce((s, d) => s + Number(d.k.amount), 0))}):`);
  for (const d of dues.slice(0, 12)) {
    const n = daysUntil(d.due);
    lines.push(`- ${d.mc.circle.name} round ${d.round.round_no}: ${peso(d.k.amount)} due ${d.due} (${n < 0 ? `${-n} days overdue` : n === 0 ? 'today' : `in ${n} days`})${d.k.status === 'rejected' ? ' — receipt was rejected' : ''}`);
  }

  const progress = goals.map((g) => goalProgress(g, deposits, circles));
  lines.push('', `IPON GOALS (${goals.length}), weekly saving streak ${iponStreak(deposits)}:`);
  for (const p of progress) {
    const g = p.goal;
    const plan = g.plan_amount && g.plan_frequency ? `plan ${peso(g.plan_amount)} ${planPer[g.plan_frequency]}` : 'no savings plan';
    lines.push(`- ${g.title}: saved ${peso(p.saved)} of ${peso(g.target)} (${Math.round(p.progress * 100)}%); ${plan}; ${g.deadline ? `target date ${g.deadline}` : 'no target date'}${p.needed ? `; needs ${peso(p.needed)} ${planPer[g.plan_frequency ?? 'weekly']} to finish on time` : ''}; status ${p.status}${p.circleName ? `; linked to circle ${p.circleName} (${peso(p.fromCircle)} counted from it)` : ''}`);
  }

  if (deposits.length) {
    const titleOf = new Map(goals.map((g) => [g.id, g.title]));
    lines.push('', 'RECENT IPON ENTRIES:');
    for (const d of deposits.slice(0, 12)) {
      lines.push(`- ${d.created_at.slice(0, 10)} ${d.amount > 0 ? 'deposit' : 'withdrawal'} ${peso(Math.abs(d.amount))} to ${titleOf.get(d.goal_id) ?? 'goal'}${d.note ? ` (“${d.note}”)` : ''}`);
    }
  }

  if (activity.length) {
    lines.push('', 'RECENT CIRCLE ACTIVITY:');
    for (const a of activity.slice(0, 12)) {
      lines.push(`- ${a.created_at.slice(0, 10)} ${a.circles?.name ?? ''}: ${describeActivity(a).text}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- edge function calls

async function callAi<T>(body: Record<string, unknown>): Promise<T> {
  if (demoState.on) throw new Error('Ipon AI needs a real account. Exit the demo to try it.');
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (error) {
    // FunctionsHttpError keeps the response so we can show the server's message.
    const ctx = (error as { context?: Response }).context;
    let msg = error.message;
    try {
      const j = ctx ? await ctx.json() : null;
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    if (/Failed to send a request|not found/i.test(msg)) msg = 'Ipon AI isn’t deployed yet. Deploy the `ai` Edge Function first.';
    throw new Error(msg);
  }
  return data as T;
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string; at: string };

export type AiPlan = { amount: number; frequency: PlanFrequency; deadline: string; summary: string; tips: string[] };

export function useAiPlan() {
  return useMutation({
    mutationFn: (v: { goal: { title: string; target: number; saved: number; deadline: string | null }; context: string }) =>
      callAi<{ plan: AiPlan }>({ mode: 'plan', ...v }).then((r) => r.plan),
  });
}

export function useAiInsight() {
  return useMutation({
    mutationFn: (context: string) => callAi<{ insight: string }>({ mode: 'insight', context }).then((r) => r.insight),
  });
}

// ---------------------------------------------------------------- chat history (on device)

const CHAT_KEY = 'pango-chat-v1';
let chat: ChatMessage[] = (() => {
  try {
    return JSON.parse(kv.get(CHAT_KEY) ?? '[]') as ChatMessage[];
  } catch {
    return [];
  }
})();
const listeners = new Set<() => void>();
function setChat(next: ChatMessage[]) {
  chat = next.slice(-60);
  kv.set(CHAT_KEY, JSON.stringify(chat));
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useChat() {
  const messages = useSyncExternalStore(subscribe, () => chat, () => chat);
  const send = useMutation({
    mutationFn: async ({ text, context }: { text: string; context: string }) => {
      const mine: ChatMessage = { role: 'user', content: text.trim(), at: new Date().toISOString() };
      const history = [...chat, mine];
      setChat(history);
      try {
        const { reply } = await callAi<{ reply: string }>({
          mode: 'chat',
          context,
          messages: history.map(({ role, content }) => ({ role, content })),
        });
        setChat([...chat, { role: 'assistant', content: reply || '…', at: new Date().toISOString() }]);
      } catch (e) {
        // Drop the unanswered message so the history stays user/assistant alternating.
        setChat(chat.filter((m) => m !== mine));
        throw e;
      }
    },
  });
  return { messages, send, clear: () => setChat([]) };
}
