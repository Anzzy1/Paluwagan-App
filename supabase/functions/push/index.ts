// Supabase Edge Function: push
//
// Two modes:
//   1. Cron reminders  — POST {"mode":"reminders"} with header `x-cron-secret: <CRON_SECRET>`
//      Sends a push to every member with an unpaid contribution due in 3 days,
//      1 day, today, or overdue.
//   2. Reminder nudge  — POST {"mode":"nudge","round_id":"..."} with the user's JWT.
//      Caller must be the circle admin or the round's recipient.
//
// Deploy:  supabase functions deploy push
// Secrets: supabase secrets set CRON_SECRET=<random string>

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown>; sound?: 'default' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const peso = (n: number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

async function sendPush(messages: PushMessage[]) {
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ------------------------------------------------------------------ reminders
  if (body.mode === 'reminders') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const today = manilaToday();
    const { data, error } = await admin
      .from('contributions')
      .select('id, amount, user_id, due_date, rounds!inner(due_date, round_no, circle_id), circles!inner(name, grace_days, status, paused_at, deleted_at), profiles!contributions_user_id_fkey!inner(push_token)')
      .in('status', ['pending', 'rejected'])
      .eq('circles.status', 'active')
      .is('circles.paused_at', null)
      .is('circles.deleted_at', null)
      .not('profiles.push_token', 'is', null);
    if (error) return json({ error: error.message }, 500);

    const messages: PushMessage[] = [];
    for (const row of data ?? []) {
      // deno-lint-ignore no-explicit-any
      const r = row as any;
      // Each contribution has its own hulog date (older circles: the round's date).
      const diff = daysBetween(today, r.due_date ?? r.rounds.due_date);
      let msg: string | null = null;
      if (diff === 3) msg = `Your contribution to ${r.circles.name} is due in 3 days.`;
      else if (diff === 1) msg = `Your contribution to ${r.circles.name} is due tomorrow.`;
      else if (diff === 0) msg = `Your contribution to ${r.circles.name} is due today.`;
      else if (diff < -r.circles.grace_days) msg = `Your contribution to ${r.circles.name} is overdue. Pay now to protect your Trust Score.`;
      if (!msg) continue;
      messages.push({
        to: r.profiles.push_token,
        title: `Contribution due: ${peso(r.amount)}`,
        body: msg,
        sound: 'default',
        data: { url: `/circle/${r.rounds.circle_id}` },
      });
    }
    await sendPush(messages);
    return json({ sent: messages.length });
  }

  // ------------------------------------------------------------------ nudge
  if (body.mode === 'nudge' && typeof body.round_id === 'string') {
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return json({ error: 'Unauthorized' }, 401);

    const { data: round } = await admin
      .from('rounds').select('id, circle_id, slot_group, round_no, circles(name)').eq('id', body.round_id).single();
    if (!round) return json({ error: 'Round not found' }, 404);

    const { data: caller } = await admin
      .from('circle_members').select('role, slot_group')
      .eq('circle_id', round.circle_id).eq('user_id', uid).eq('status', 'approved').maybeSingle();
    if (!caller || (caller.role !== 'admin' && caller.slot_group !== round.slot_group)) {
      return json({ error: 'Admin or recipient only' }, 403);
    }

    const { data: unpaid } = await admin
      .from('contributions').select('amount, profiles!contributions_user_id_fkey!inner(push_token)')
      .eq('round_id', round.id).in('status', ['pending', 'rejected']);

    // deno-lint-ignore no-explicit-any
    const circleName = (round as any).circles?.name ?? 'your circle';
    const messages: PushMessage[] = (unpaid ?? [])
      // deno-lint-ignore no-explicit-any
      .filter((u: any) => u.profiles?.push_token)
      // deno-lint-ignore no-explicit-any
      .map((u: any) => ({
        to: u.profiles.push_token,
        title: `Payment reminder · ${circleName}`,
        body: `Your ${peso(u.amount)} contribution for round ${round.round_no} is still pending.`,
        sound: 'default',
        data: { url: `/circle/${round.circle_id}` },
      }));
    await sendPush(messages);
    await admin.from('activity').insert({
      circle_id: round.circle_id, actor: uid, type: 'nudge_sent',
      payload: { round_no: round.round_no, count: messages.length },
    });
    return json({ sent: messages.length });
  }

  return json({ error: 'Unknown mode' }, 400);
});
