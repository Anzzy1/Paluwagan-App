/**
 * Notifications = things that need the user's attention now or soon (pay, review, release).
 * Not the same as Activity, which is the permanent audit trail of what already happened.
 * Everything here is derived from current data, so items disappear once they're handled.
 */
import type { Href } from 'expo-router';
import { useSyncExternalStore } from 'react';

import type { IconName } from '@/components/ui/bits';
import { describeActivity } from '@/lib/activityText';
import { useActivity, useInbox, useMyCircles, type Inbox, type MyCircle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { summarize, unpaid } from '@/lib/derive';
import { daysUntil, longDate, peso, relativeDue, todayISO } from '@/lib/format';
import { useNotices, type Notice } from '@/lib/notices';
import { kv } from '@/lib/storage';
import type { Activity } from '@/lib/types';
import { hulogDays, hulogToday, managedSummary, missedPayments, nextHulog, paidOn, useManagedCircles, type LocalCircle } from '@/lib/local';

export type NoticeTone = 'danger' | 'warning' | 'success' | 'info';

export type AppNotification = {
  id: string;
  /** Needs the user to do something (counts toward the bell badge). */
  action: boolean;
  tone: NoticeTone;
  icon: IconName;
  title: string;
  body: string;
  circle: string;
  href: Href;
  /** Lower = more urgent. */
  rank: number;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function online(list: MyCircle[], inbox: Inbox | undefined): AppNotification[] {
  const out: AppNotification[] = [];
  for (const mc of list) {
    const { circle } = mc;
    const href = `/circle/${circle.id}` as Href;
    const base = { circle: circle.name, href };

    if (circle.paused_at) {
      out.push({ ...base, id: `paused-${circle.id}`, action: false, tone: 'warning', icon: 'pause-circle', title: 'Paluwagan paused', body: circle.pause_reason || 'The admin paused this paluwagan. Reminders are off.', rank: 40 });
      continue;
    }

    // My hulog: overdue, rejected, due today, or due in the next 2 days.
    const dues = unpaid(mc.contributions, mc.rounds);
    const rejected = dues.filter((d) => d.k.status === 'rejected');
    const overdue = dues.filter((d) => d.k.status === 'pending' && daysUntil(d.due) < 0);
    const today = dues.filter((d) => d.k.status === 'pending' && daysUntil(d.due) === 0);
    const soon = dues.find((d) => d.k.status === 'pending' && daysUntil(d.due) > 0 && daysUntil(d.due) <= 2);
    for (const d of rejected) {
      out.push({ ...base, id: `rejected-${d.k.id}`, action: true, tone: 'danger', icon: 'x-circle', title: 'Payment proof rejected', body: d.k.reject_reason ? `“${d.k.reject_reason}” · Upload a new proof for ${longDate(d.due)}.` : `Upload a new proof for your hulog on ${longDate(d.due)}.`, rank: 0 });
    }
    if (overdue.length) {
      const total = overdue.reduce((s, d) => s + Number(d.k.amount), 0);
      out.push({ ...base, id: `overdue-${circle.id}`, action: true, tone: 'danger', icon: 'alert-circle', title: 'Hulog overdue', body: `${plural(overdue.length, 'missed hulog')} · ${peso(total)} to pay, oldest ${longDate(overdue[0].due)}.`, rank: 1 });
    }
    if (today.length) {
      out.push({ ...base, id: `today-${circle.id}`, action: true, tone: 'warning', icon: 'calendar', title: 'Hulog due today', body: `Pay ${peso(today.reduce((s, d) => s + Number(d.k.amount), 0))} and upload your proof.`, rank: 2 });
    }
    if (soon && !today.length && !overdue.length) {
      out.push({ ...base, id: `soon-${soon.k.id}`, action: false, tone: 'info', icon: 'clock', title: `Hulog ${relativeDue(soon.due).toLowerCase()}`, body: `${peso(Number(soon.k.amount))} on ${longDate(soon.due)}.`, rank: 20 });
    }

    // My sahod coming up.
    const s = summarize(mc);
    if (s.myRound && s.myRound.status !== 'completed') {
      const days = daysUntil(s.myRound.due_date);
      if (days <= 3 && days >= 0) {
        out.push({ ...base, id: `sahod-${s.myRound.id}`, action: false, tone: 'success', icon: 'gift', title: days === 0 ? 'Your sahod is today' : `Your sahod is in ${plural(days, 'day')}`, body: `${peso(s.myPayout)} on ${longDate(s.myRound.due_date)}.`, rank: 10 });
      }
    }

    // Waiting on me (admin reviews, swap requests).
    const joins = inbox?.joinRequests[circle.id] ?? 0;
    const proofs = inbox?.proofs[circle.id] ?? 0;
    const swaps = inbox?.swaps[circle.id] ?? 0;
    if (proofs) out.push({ ...base, id: `proofs-${circle.id}`, action: true, tone: 'warning', icon: 'file-text', title: `${plural(proofs, 'payment')} to review`, body: 'Check the receipts and confirm or reject them.', rank: 3 });
    if (joins) out.push({ ...base, id: `joins-${circle.id}`, action: true, tone: 'info', icon: 'user-plus', title: `${plural(joins, 'join request')}`, body: 'Approve or decline who can join.', rank: 4 });
    if (swaps) out.push({ ...base, id: `swaps-${circle.id}`, action: true, tone: 'info', icon: 'repeat', title: `${plural(swaps, 'turn swap request')}`, body: 'Someone wants to trade payout turns with you.', rank: 5, href: `/circle/${circle.id}/swaps` as Href });
  }
  return out;
}

function managed(list: LocalCircle[]): AppNotification[] {
  const out: AppNotification[] = [];
  for (const c of list) {
    const href = `/managed/${c.id}` as Href;
    const base = { circle: c.name, href };
    const n = c.members.length;
    if (c.status === 'forming') {
      out.push(
        n < 2
          ? { ...base, id: `m-members-${c.id}`, action: true, tone: 'info', icon: 'user-plus', title: 'Add members', body: 'Add at least 2 members so you can run the draw.', rank: 6 }
          : { ...base, id: `m-draw-${c.id}`, action: true, tone: 'info', icon: 'shuffle', title: 'Ready for the draw', body: `${n} members are in. Run the draw to set the sahod order.`, rank: 6 },
      );
      continue;
    }
    if (c.status === 'completed' && !hulogToday(c) && !nextHulog(c)) continue;
    if (c.paused_at) {
      out.push({ ...base, id: `m-paused-${c.id}`, action: false, tone: 'warning', icon: 'pause-circle', title: 'Paluwagan paused', body: `${c.pause_reason ? `“${c.pause_reason}” · ` : ''}Paused since ${longDate(c.paused_at)}. Resume when the group is ready.`, rank: 40 });
      continue;
    }

    const day = hulogToday(c);
    if (day) {
      const left = n - paidOn(day.round, day.date);
      if (left > 0) out.push({ ...base, id: `m-today-${c.id}`, action: true, tone: 'warning', icon: 'calendar', title: 'Collect today’s hulog', body: `${left} of ${n} members haven’t paid yet.`, rank: 2 });
    } else {
      const next = nextHulog(c);
      const started = hulogDays(c).some((d) => d.date < todayISO());
      if (next) {
        const days = daysUntil(next.date);
        if (!started) out.push({ ...base, id: `m-start-${c.id}`, action: false, tone: 'info', icon: 'flag', title: `First hulog ${relativeDue(next.date).replace('Due ', '').toLowerCase()}`, body: `The paluwagan starts on ${longDate(next.date)}. Remind members to prepare ${peso(c.amount)}.`, rank: 18 });
        else if (days <= 1) out.push({ ...base, id: `m-next-${c.id}`, action: false, tone: 'info', icon: 'clock', title: 'Hulog tomorrow', body: `Collect ${peso(c.amount)} from each of the ${n} members on ${longDate(next.date)}.`, rank: 19 });
      }
    }

    const missed = missedPayments(c);
    if (missed.length) {
      const total = missed.reduce((s, b) => s + b.owed, 0);
      out.push({ ...base, id: `m-missed-${c.id}`, action: true, tone: 'danger', icon: 'alert-circle', title: 'Unpaid hulog from past dates', body: `${plural(missed.length, 'member')} owe ${peso(total)}.`, rank: 1 });
    }

    const s = managedSummary(c);
    if (c.status === 'active' && s.current) {
      const days = daysUntil(s.current.due_date);
      const who = s.recipient?.name ?? 'the next member';
      if (days <= 0) out.push({ ...base, id: `m-sahod-${c.id}-${s.current.round_no}`, action: true, tone: 'success', icon: 'gift', title: 'Sahod ready to release', body: `Sahod ${s.current.round_no} goes to ${who}${days < 0 ? ` · ${plural(-days, 'day')} past the date` : ' today'}.`, rank: 3 });
      else if (days <= 7) out.push({ ...base, id: `m-sahod-${c.id}-${s.current.round_no}`, action: false, tone: 'info', icon: 'gift', title: days === 1 ? 'Sahod tomorrow' : `Sahod in ${plural(days, 'day')}`, body: `${who} receives on ${longDate(s.current.due_date)}.`, rank: 15 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- updates (things others did)

export type AppUpdate = { id: string; at: string; tone: NoticeTone | 'neutral' | 'brand'; icon: IconName; text: string; circle: string; href: Href };

/** Activity types worth telling a member about. Admin-only ones need the admin role. */
const MEMBER_TYPES = new Set([
  'payment_confirmed', 'payment_rejected', 'nudge_sent', 'member_approved', 'draw_completed', 'order_set', 'circle_locked',
  'circle_paused', 'circle_resumed', 'round_completed', 'circle_completed', 'circle_deleted', 'circle_restored',
  'swap_requested', 'swap_accepted', 'swap_declined', 'swap_approved', 'swap_rejected',
]);
const ADMIN_TYPES = new Set(['member_requested', 'proof_submitted', 'member_left']);
const UPDATE_DAYS = 14;

export function buildUpdates(activity: Activity[], list: MyCircle[], userId: string | null): AppUpdate[] {
  const admin = new Set(list.filter((mc) => mc.membership.role === 'admin').map((mc) => mc.circle.id));
  const since = Date.now() - UPDATE_DAYS * 86_400_000;
  return activity
    .filter((a) => a.actor !== userId && new Date(a.created_at).getTime() >= since)
    .filter((a) => MEMBER_TYPES.has(a.type) || (ADMIN_TYPES.has(a.type) && admin.has(a.circle_id)))
    .map((a) => {
      const d = describeActivity(a);
      return { id: `a-${a.id}`, at: a.created_at, tone: d.tone, icon: d.icon, text: d.text, circle: a.circles?.name ?? 'Paluwagan', href: `/circle/${a.circle_id}` as Href };
    });
}

/** Device notices from the last UPDATE_DAYS days, shaped like updates. */
function recentNotices(notices: Notice[]): AppUpdate[] {
  const since = Date.now() - UPDATE_DAYS * 86_400_000;
  return notices.filter((x) => new Date(x.at).getTime() >= since).map((x) => ({ ...x, id: `n-${x.id}` }));
}

// Last time the user opened Notifications (updates after this are unread).
const SEEN_KEY = 'notifications-seen-v1';
let seenAt = kv.get(SEEN_KEY) ?? '';
const seenListeners = new Set<() => void>();
export function markNotificationsSeen() {
  seenAt = new Date().toISOString();
  kv.set(SEEN_KEY, seenAt);
  seenListeners.forEach((l) => l());
}
function useSeenAt() {
  return useSyncExternalStore(
    (l) => (seenListeners.add(l), () => void seenListeners.delete(l)),
    () => seenAt,
    () => seenAt,
  );
}

export function buildNotifications(list: MyCircle[], inbox: Inbox | undefined, local: LocalCircle[]): AppNotification[] {
  return [...online(list, inbox), ...managed(local)].sort((a, b) => a.rank - b.rank);
}

/** Live notifications for the signed-in user (online + managed paluwagan). */
export function useNotifications() {
  const { userId } = useAuth();
  const circles = useMyCircles();
  const inbox = useInbox();
  const activity = useActivity();
  const local = useManagedCircles();
  const seen = useSeenAt();
  const items = buildNotifications(circles.data ?? [], inbox.data, local);
  const notices = useNotices();
  // What others did online + what happened on this device (day completed, evening reminders).
  const updates = [...buildUpdates(activity.data ?? [], circles.data ?? [], userId ?? null), ...recentNotices(notices)].sort((a, b) => b.at.localeCompare(a.at));
  const unread = updates.filter((u) => u.at > seen).length;
  return {
    items,
    updates,
    seenAt: seen,
    /** Bell badge: things to do + updates not seen yet. */
    count: items.filter((x) => x.action).length + unread,
    refreshing: circles.isRefetching || inbox.isRefetching || activity.isRefetching,
    refresh: () => Promise.all([circles.refetch(), inbox.refetch(), activity.refetch()]),
  };
}
