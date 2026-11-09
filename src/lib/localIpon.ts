/**
 * Ipon goals saved on this device.
 *
 * Used when there's no account (offline mode) or no internet, so saving keeps working
 * anywhere. They live next to the online goals: ids start with "local-" and every
 * hook in api.ts routes reads and writes by that prefix.
 */
import { useSyncExternalStore } from 'react';

import { kv } from '@/lib/storage';
import type { Deposit, Goal, PlanFrequency } from '@/lib/types';

const KEY = 'local-ipon-v1';
export const LOCAL_USER = 'device';
export const isLocalId = (id: string | null | undefined) => !!id && id.startsWith('local-');

type Store = { goals: Goal[]; deposits: Deposit[] };

const uid = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let store: Store = (() => {
  try {
    const s = JSON.parse(kv.get(KEY) ?? 'null') as Store | null;
    return s && Array.isArray(s.goals) && Array.isArray(s.deposits) ? s : { goals: [], deposits: [] };
  } catch {
    return { goals: [], deposits: [] };
  }
})();
const listeners = new Set<() => void>();

function commit(next: Store) {
  store = next;
  kv.set(KEY, JSON.stringify(store));
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Device goals and deposits, newest first (re-renders on change). */
export function useLocalIpon(): Store {
  return useSyncExternalStore(subscribe, () => store, () => store);
}

export type GoalInput = {
  id?: string;
  title: string;
  target: number;
  emoji: string;
  circle_id: string | null;
  deadline?: string | null;
  plan_amount?: number | null;
  plan_frequency?: PlanFrequency | null;
  completed_at?: string | null;
};

export function saveLocalGoal(g: GoalInput) {
  if (g.id) {
    commit({ ...store, goals: store.goals.map((x) => (x.id === g.id ? { ...x, ...g, id: x.id } : x)) });
    return;
  }
  const goal: Goal = {
    id: uid(),
    user_id: LOCAL_USER,
    circle_id: g.circle_id,
    title: g.title,
    target: g.target,
    emoji: g.emoji,
    deadline: g.deadline ?? null,
    plan_amount: g.plan_amount ?? null,
    plan_frequency: g.plan_frequency ?? null,
    completed_at: g.completed_at ?? null,
    created_at: new Date().toISOString(),
  };
  commit({ ...store, goals: [goal, ...store.goals] });
}

export function deleteLocalGoal(id: string) {
  commit({ goals: store.goals.filter((g) => g.id !== id), deposits: store.deposits.filter((d) => d.goal_id !== id) });
}

export function addLocalDeposit(d: { goal_id: string; amount: number; note?: string | null }) {
  const dep: Deposit = { id: uid(), goal_id: d.goal_id, user_id: LOCAL_USER, amount: d.amount, note: d.note?.trim() || null, created_at: new Date().toISOString() };
  commit({ ...store, deposits: [dep, ...store.deposits] });
}

export function deleteLocalDeposit(id: string) {
  commit({ ...store, deposits: store.deposits.filter((d) => d.id !== id) });
}
