/**
 * Ipon AI — client side.
 *
 * Builds a compact text snapshot of the user's own data (circles, dues, ipon goals,
 * deposits, activity) and sends it with each request. With internet and an account the
 * request goes to the `ai` Edge Function (Groq, key kept on the server); otherwise to the
 * local AI through Ollama (src/lib/localAi.ts).
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
import { ollamaChat } from '@/lib/localAi';
import { checkConnection, isNetworkError, isOnline, useOnline } from '@/lib/network';
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
    lines.push(`- ${m.name} (offline paluwagan I organise): ${peso(m.amount)} ${payoutShort(m).toLowerCase()}, ${m.members.length} members, pot ${peso(potOfManaged(m))}, status ${m.status}${s.current ? `, round ${s.current.round_no} due ${s.current.due_date}, ${s.paidCount}/${m.members.length} paid, recipient ${s.recipient?.name ?? '—'}` : ''}${s.overdue ? ' (OVERDUE)' : ''}`);
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

// ---------------------------------------------------------------- routing: online (Groq) or local (Ollama)

export type AiSource = 'cloud' | 'local';

/** Same rules as the server prompt, kept short for small local models. */
const LOCAL_SYSTEM = `You are Ipon, the friendly squirrel money buddy inside Paluwagan, a Filipino app for paluwagan (rotating savings groups) and ipon (savings goals). Amounts are in Philippine pesos (₱).
- Call a group a "paluwagan", never a "circle".
- Use the user's data snapshot below for real numbers, names and dates. Never invent numbers that aren't in it.
- Be warm, practical and short: plain text, short paragraphs, "• " for lists, no markdown headings, tables or bold.
- A paluwagan has no interest: warn if one promises interest or returns (a common scam).
- You're not a licensed financial adviser. Never ask for passwords, OTPs or PINs.`;

const snapshot = (context: string) => `User data snapshot (as of ${new Date().toISOString().slice(0, 10)}):\n${context || '(no data yet)'}`;

/** Online AI: the `ai` Edge Function (Groq, key kept on the server). */
async function callCloud<T>(body: Record<string, unknown>): Promise<T> {
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
    if (/not found/i.test(msg) && !/model/i.test(msg)) msg = 'Ipon AI isn’t deployed yet. Deploy the `ai` Edge Function first.';
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Run an AI request: online (Groq) when signed in with internet, otherwise the local AI.
 * If the online call can't reach the server, it falls back to the local AI.
 */
async function route<T>(useLocal: boolean, cloud: () => Promise<T>, local: () => Promise<T>): Promise<{ result: T; source: AiSource }> {
  if (demoState.on) throw new Error('Ipon AI needs a real account. Exit the demo to try it.');
  if (useLocal || !isOnline()) return { result: await local(), source: 'local' };
  try {
    return { result: await cloud(), source: 'cloud' };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Only fall back when the internet is really gone. A missing or broken `ai` function
    // also looks like a network error in the browser (failed CORS preflight).
    if (await checkConnection()) {
      throw new Error('Couldn’t reach Ipon AI online. If it was just set up, the `ai` Edge Function may not be deployed yet. Please try again later.');
    }
    return { result: await local(), source: 'local' };
  }
}

/** Whether AI requests go to the local model right now. */
export function useAiSource(): AiSource {
  const { isOffline } = useAuth();
  const online = useOnline();
  return isOffline || !online ? 'local' : 'cloud';
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string; at: string; source?: AiSource };

export type AiPlan = { amount: number; frequency: PlanFrequency; deadline: string; summary: string; tips: string[] };

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'frequency', 'deadline', 'summary', 'tips'],
  properties: {
    amount: { type: 'number' },
    frequency: { type: 'string', enum: ['daily', 'weekly', 'kinsenas', 'monthly'] },
    deadline: { type: 'string' },
    summary: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
  },
};

function planPrompt(goal: { title: string; target: number; saved: number; deadline: string | null }) {
  return `Suggest a realistic savings plan for this goal. Reply with JSON only: {"amount": number (pesos per period), "frequency": "daily"|"weekly"|"kinsenas"|"monthly", "deadline": "YYYY-MM-DD", "summary": "one or two sentences", "tips": ["two or three short tips"]}.
Goal: ${goal.title}
Target: ₱${goal.target}
Already saved: ₱${goal.saved}
Target date the user chose: ${goal.deadline ?? 'none, propose one'}
Today: ${new Date().toISOString().slice(0, 10)}
Fit it around their paluwagan dues. Keep the amount achievable.`;
}

/** Small models sometimes drift: check the plan and fill safe defaults. */
function cleanPlan(raw: unknown): AiPlan {
  const p = (raw ?? {}) as Partial<AiPlan>;
  const freq: PlanFrequency[] = ['daily', 'weekly', 'kinsenas', 'monthly'];
  const amount = Math.max(0, Math.round(Number(p.amount) || 0));
  if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.deadline))) throw new Error('The AI gave an incomplete plan. Try again.');
  return {
    amount,
    frequency: freq.includes(p.frequency as PlanFrequency) ? (p.frequency as PlanFrequency) : 'weekly',
    deadline: String(p.deadline),
    summary: String(p.summary ?? ''),
    tips: Array.isArray(p.tips) ? p.tips.map(String).slice(0, 3) : [],
  };
}

const DAYS_PER: Record<PlanFrequency, number> = { daily: 1, weekly: 7, kinsenas: 15.2, monthly: 30.4 };

/** Amount per period that reaches the target by the deadline, rounded up to ₱10. */
function fixPlanMath(plan: AiPlan, goal: { target: number; saved: number }): AiPlan {
  const remaining = Math.max(0, goal.target - goal.saved);
  const days = Math.max(1, daysUntil(plan.deadline));
  const periods = Math.max(1, Math.ceil(days / DAYS_PER[plan.frequency]));
  const amount = Math.max(10, Math.ceil(remaining / periods / 10) * 10);
  return { ...plan, amount, summary: `Save ${peso(amount)} ${planPer[plan.frequency]} until ${plan.deadline} to reach ${peso(goal.target)}.${plan.summary ? ` ${plan.summary.split(/(?<=\.)\s/)[0]}` : ''}` };
}

export function useAiPlan() {
  const local = useAiSource() === 'local';
  return useMutation({
    mutationFn: async (v: { goal: { title: string; target: number; saved: number; deadline: string | null }; context: string }) => {
      const { result } = await route(
        local,
        () => callCloud<{ plan: AiPlan }>({ mode: 'plan', ...v }).then((r) => cleanPlan(r.plan)),
        async () => {
          const raw = await ollamaChat(
            [
              { role: 'system', content: `${LOCAL_SYSTEM}\n\n${snapshot(v.context)}` },
              { role: 'user', content: planPrompt(v.goal) },
            ],
            { format: PLAN_SCHEMA },
          );
          // Small local models get the arithmetic wrong, so work out the amount here.
          return fixPlanMath(cleanPlan(JSON.parse(raw)), v.goal);
        },
      );
      return result;
    },
  });
}

export function useAiInsight() {
  const local = useAiSource() === 'local';
  return useMutation({
    mutationFn: async (context: string) => {
      const ask =
        'Look at my snapshot and give me one short, specific insight about my savings and paluwagan right now (max 2 sentences, under 45 words). Mention a real number or name from my data and one next step.';
      const { result } = await route(
        local,
        () => callCloud<{ insight: string }>({ mode: 'insight', context }).then((r) => r.insight),
        () =>
          ollamaChat([
            { role: 'system', content: `${LOCAL_SYSTEM}\n\n${snapshot(context)}` },
            { role: 'user', content: ask },
          ]),
      );
      return result;
    },
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
  const local = useAiSource() === 'local';
  const send = useMutation({
    mutationFn: async ({ text, context }: { text: string; context: string }) => {
      const mine: ChatMessage = { role: 'user', content: text.trim(), at: new Date().toISOString() };
      const history = [...chat, mine];
      setChat(history);
      try {
        const turns = history.slice(-12).map(({ role, content }) => ({ role, content }));
        const { result: reply, source } = await route(
          local,
          () => callCloud<{ reply: string }>({ mode: 'chat', context, messages: turns }).then((r) => r.reply),
          () => ollamaChat([{ role: 'system', content: `${LOCAL_SYSTEM}\n\n${snapshot(context)}` }, ...turns]),
        );
        setChat([...chat, { role: 'assistant', content: reply || '…', at: new Date().toISOString(), source }]);
      } catch (e) {
        // Drop the unanswered message so the history stays user/assistant alternating.
        setChat(chat.filter((m) => m !== mine));
        throw e;
      }
    },
  });
  return { messages, send, clear: () => setChat([]) };
}
