/**
 * End-of-day hulog reminders.
 *
 * Checking members off stays quiet. If today's hulog still isn't complete by evening,
 * Ipon says so once (in-app), the reminder is saved to Notifications, and on a phone
 * a real device notification is scheduled for that evening (cancelled once the day is complete).
 */
import * as Notifications from 'expo-notifications';
import type { Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useMyCircles } from '@/lib/api';
import { unpaid } from '@/lib/derive';
import { daysUntil, peso, todayISO } from '@/lib/format';
import { hulogToday, paidOn, useManagedCircles } from '@/lib/local';
import { hasNotice, pushNotice } from '@/lib/notices';
import { usePrefs } from '@/lib/prefs';
import { showReaction } from '@/lib/reactions';

/** Local hour (24h) when an incomplete day counts as "about to end". */
export const REMIND_HOUR = 18;

type Pending = { key: string; noticeId: string; circle: string; href: Href; title: string; body: string };

function eveningToday() {
  const d = new Date();
  d.setHours(REMIND_HOUR, 0, 0, 0);
  return d;
}

/** Re-render once a minute so the evening check runs even if nothing else changes. */
function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
}

export function useHulogReminders() {
  useMinuteTick();
  const { toggles } = usePrefs();
  const managed = useManagedCircles();
  const online = useMyCircles();
  const today = todayISO();

  // Everything that is due today and not complete yet.
  const pending: Pending[] = [];
  for (const c of managed) {
    if (c.status === 'forming' || c.paused_at) continue;
    const day = hulogToday(c);
    if (!day) continue;
    const left = c.members.length - paidOn(day.round, day.date);
    if (left <= 0) continue;
    pending.push({
      key: `m-${c.id}`,
      noticeId: `hulog-${c.id}-${today}`,
      circle: c.name,
      href: `/managed/${c.id}` as Href,
      title: 'Today’s hulog isn’t complete',
      body: `${left} of ${c.members.length} member${c.members.length === 1 ? '' : 's'} in ${c.name} still need to pay ${peso(c.amount)} today.`,
    });
  }
  for (const mc of online.data ?? []) {
    if (mc.circle.paused_at) continue;
    const due = unpaid(mc.contributions, mc.rounds).filter((d) => d.k.status === 'pending' && daysUntil(d.due) === 0);
    if (!due.length) continue;
    const amount = due.reduce((s, d) => s + Number(d.k.amount), 0);
    pending.push({
      key: `o-${mc.circle.id}`,
      noticeId: `hulog-o-${mc.circle.id}-${today}`,
      circle: mc.circle.name,
      href: `/circle/${mc.circle.id}` as Href,
      title: 'Your hulog is due today',
      body: `Pay ${peso(amount)} for ${mc.circle.name} and upload your proof before the day ends.`,
    });
  }

  const evening = new Date().getHours() >= REMIND_HOUR;
  const signature = pending.map((p) => p.key).join('|');

  // In-app: once per paluwagan per day, after REMIND_HOUR.
  useEffect(() => {
    if (!evening) return;
    const fresh = pending.filter((p) => !hasNotice(p.noticeId));
    if (!fresh.length) return;
    for (const p of fresh) {
      pushNotice({ id: p.noticeId, tone: 'warning', icon: 'clock', text: `${p.title}. ${p.body}`, circle: p.circle, href: p.href });
    }
    const first = fresh[0];
    showReaction({
      mood: 'worried',
      pose: 'coin',
      action: 'wave',
      title: fresh.length > 1 ? `${fresh.length} hulog still open today` : first.title,
      text: fresh.length > 1 ? `${fresh.map((p) => p.circle).join(', ')} still have unpaid hulog. The day is almost over.` : `${first.body} The day is almost over.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` captures `pending`
  }, [evening, signature, today]);

  // Device notifications (phones only): one per paluwagan at REMIND_HOUR today.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const ours = scheduled.filter((n) => n.identifier.startsWith('hulog-eod-'));
        const want = toggles.push && !evening ? pending : [];
        const wantIds = new Set(want.map((p) => `hulog-eod-${p.key}-${today}`));
        // Cancel reminders that are no longer needed (day completed, old days, push turned off).
        for (const n of ours) if (!wantIds.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
        if (!want.length || cancelled) return;
        let { status } = await Notifications.getPermissionsAsync();
        if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return;
        const have = new Set(ours.map((n) => n.identifier));
        for (const p of want) {
          const id = `hulog-eod-${p.key}-${today}`;
          if (have.has(id) || cancelled) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: id,
            content: { title: `${p.circle}: ${p.title}`, body: 'The day is almost over. Open Paluwagan to see who still needs to pay.', data: { url: p.href } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: eveningToday() },
          });
        }
      } catch (e) {
        console.log('[reminders] skipped:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` captures `pending`
  }, [signature, evening, toggles.push, today]);
}
