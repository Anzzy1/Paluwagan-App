/**
 * Demo mode — explore the full UI with realistic sample data, no account needed.
 * Every query's queryFn short-circuits to `demoQuery(key)`; every mutation throws `DemoError`.
 */
import type { CircleDetail, MyCircle } from '@/lib/api';
import { toISODate } from '@/lib/format';
import type { Activity, Circle, CirclePreview, Contribution, Deposit, Goal, Member, Profile, Round, Swap } from '@/lib/types';

export const demoState = { on: false };
export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000aaaa';

export class DemoError extends Error {
  constructor() {
    super('This is a demo with sample data. Sign in to create and manage real circles.');
  }
}
export function assertLive() {
  if (demoState.on) throw new DemoError();
}

// ---------------------------------------------------------------- helpers
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toISODate(d);
};
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
let seq = 0;
const uid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;

// ---------------------------------------------------------------- people
const P = (id: string, full_name: string, avatar_emoji: string, tiwala_score: number, gcash?: string): Profile => ({
  id,
  full_name,
  avatar_emoji,
  tiwala_score,
  phone: null,
  gcash_number: gcash ?? null,
  push_token: null,
  avatar_url: null,
});
const me = P(DEMO_USER_ID, 'Juan Dela Cruz', '😎', 92, '0917 555 0101');
const maria = P(uid(), 'Maria Santos', '🌻', 98, '0918 222 3344');
const paolo = P(uid(), 'Paolo Reyes', '🐯', 84, '0927 111 2233');
const bea = P(uid(), 'Bea Garcia', '🦊', 95, '0995 888 1212');
const carlo = P(uid(), 'Carlo Mendoza', '🔥', 71, '0906 333 4545');
const kim = P(uid(), 'Kim Tan', '🐼', 88);
const lia = P(uid(), 'Lia Cruz', '🍀', 90, '0919 765 4321');
const andrea = P(uid(), 'Andrea Lim', '👑', 97, '0917 246 8100');
const miguel = P(uid(), 'Miguel Torres', '🐸', 66);
const nena = P(uid(), 'Tita Nena', '🥳', 99, '0908 135 7911');

// ---------------------------------------------------------------- builders
function circle(c: Partial<Circle> & Pick<Circle, 'id' | 'name' | 'emoji' | 'color' | 'amount' | 'slots' | 'frequency' | 'status'>): Circle {
  return {
    interval_days: null,
    payout_frequency: null,
    payout_interval_days: null,
    first_payout_date: null,
    has_password: true,
    start_date: day(-30),
    late_fee: 50,
    grace_days: 1,
    rules:
      '1. Contributions are due on or before each due date. Upload proof of payment in the app.\n2. The payout recipient confirms each payment once received.\n3. Members who have received their payout must keep contributing until the circle ends.\n4. Turn swaps require consent from both members and approval from the admin.',
    order_mode: 'draw',
    invite_code: 'DEMO01',
    seed_hash: null,
    seed: null,
    draw_order: null,
    drawn_at: null,
    created_by: DEMO_USER_ID,
    created_at: ago(24 * 40),
    ...c,
  };
}

function member(circleId: string, p: Profile, group: string, slot: number | null, extra: Partial<Member> = {}): Member {
  return {
    id: uid(),
    circle_id: circleId,
    user_id: p.id,
    role: 'member',
    status: 'approved',
    share: 1,
    slot_group: group,
    slot_no: slot,
    agreed_at: ago(24 * 35),
    joined_at: ago(24 * 35 - (seq % 10)),
    profiles: p,
    ...extra,
  };
}

/** Rounds + contributions for an active/completed circle. `state(roundNo, member)` picks each status. */
function schedule(
  c: Circle,
  members: Member[],
  order: string[],
  dues: string[],
  activeRound: number | null,
  state: (roundNo: number, m: Member) => Contribution['status'],
) {
  const rounds: Round[] = [];
  const contributions: Contribution[] = [];
  order.forEach((group, i) => {
    const no = i + 1;
    const status: Round['status'] = activeRound == null || no < activeRound ? 'completed' : no === activeRound ? 'active' : 'upcoming';
    const r: Round = {
      id: uid(),
      circle_id: c.id,
      round_no: no,
      slot_group: group,
      due_date: dues[i],
      status,
      completed_at: status === 'completed' ? dues[i] + 'T10:00:00Z' : null,
    };
    rounds.push(r);
    for (const m of members) {
      const auto = m.slot_group === group;
      const st = auto ? 'confirmed' : status === 'completed' ? 'confirmed' : status === 'active' ? state(no, m) : 'pending';
      contributions.push({
        id: uid(),
        round_id: r.id,
        due_date: null,
        circle_id: c.id,
        member_id: m.id,
        user_id: m.user_id,
        amount: Number(c.amount) * Number(m.share),
        status: st,
        auto,
        proof_path: st === 'submitted' || (st === 'confirmed' && !auto) ? `demo/${m.user_id}.jpg` : null,
        note: st === 'submitted' ? 'GCash ref 8812 4410 2231' : null,
        reject_reason: null,
        submitted_at: st === 'submitted' || (st === 'confirmed' && !auto) ? ago(status === 'active' ? 5 : 24 * (40 - no * 6)) : null,
        confirmed_at: st === 'confirmed' ? ago(3) : null,
        confirmed_by: st === 'confirmed' && !auto ? DEMO_USER_ID : null,
        on_time: st === 'confirmed' && !auto ? !(m.user_id === carlo.id && no === 2) : null,
      });
    }
  });
  return { rounds, contributions };
}

// ---------------------------------------------------------------- build all data once
function build() {
  // 1) Barkada Ipon — active, kinsenas, drawn with a real verifiable seed; you're slot 5
  const c1 = circle({
    id: '00000000-0000-4000-8000-00000000c001',
    name: 'Barkada Savings 2026',
    emoji: 'dollar-sign',
    color: 'mango',
    amount: 1000,
    slots: 6,
    frequency: 'kinsenas',
    status: 'active',
    invite_code: 'BRKD26',
    created_by: maria.id,
    seed: '1d7c350f170a9aa03b2607f2aec938e0b723e29ad568991b18713cfc223a60c4',
    seed_hash: 'bd2fb9ca62f7f702e46e09b4dfff7fb1f2c188c5b2a0e0920933567dea345c54',
    drawn_at: ago(24 * 33),
  });
  const g = (n: number) => `00000000-0000-4000-8000-0000000010${String(n).padStart(2, '0')}`;
  const order1 = [g(3), g(6), g(4), g(2), g(1), g(5)];
  c1.draw_order = order1;
  const slot = (grp: string) => order1.indexOf(grp) + 1;
  const m1 = [
    member(c1.id, maria, g(2), slot(g(2)), { role: 'admin' }),
    member(c1.id, me, g(1), slot(g(1))),
    member(c1.id, paolo, g(3), slot(g(3))),
    member(c1.id, bea, g(4), slot(g(4))),
    member(c1.id, carlo, g(5), slot(g(5))),
    member(c1.id, kim, g(6), slot(g(6)), { share: 0.5 }),
    member(c1.id, lia, g(6), slot(g(6)), { share: 0.5 }),
  ];
  const s1 = schedule(c1, m1, order1, [day(-28), day(-13), day(2), day(17), day(32), day(47)], 3, (_no, m) =>
    m.user_id === maria.id || m.user_id === paolo.id ? 'confirmed' : m.user_id === kim.id ? 'submitted' : 'pending',
  );
  const swaps1: Swap[] = [
    { id: uid(), circle_id: c1.id, from_member: m1[4].id, to_member: m1[1].id, status: 'pending', created_at: ago(20) },
  ];

  // 2) Office Pantry Fund — your turn now, receipts waiting for your confirmation
  const c2 = circle({
    id: '00000000-0000-4000-8000-00000000c002',
    name: 'Office Pantry Fund',
    emoji: 'coffee',
    color: 'sky',
    amount: 2000,
    slots: 4,
    frequency: 'monthly',
    status: 'active',
    invite_code: 'PNTRY4',
    order_mode: 'manual',
    created_by: DEMO_USER_ID,
    drawn_at: ago(24 * 45),
  });
  const h = [uid(), uid(), uid(), uid()];
  const m2 = [
    member(c2.id, me, h[0], 2, { role: 'admin' }),
    member(c2.id, andrea, h[1], 1),
    member(c2.id, maria, h[2], 3),
    member(c2.id, paolo, h[3], 4),
  ];
  const order2 = [h[1], h[0], h[2], h[3]];
  c2.draw_order = order2;
  const s2 = schedule(c2, m2, order2, [day(-30), day(0), day(30), day(61)], 2, (_no, m) =>
    m.user_id === andrea.id ? 'confirmed' : m.user_id === maria.id ? 'submitted' : 'pending',
  );

  // 3) Pamilya Christmas — still forming, you're admin, join requests waiting
  const c3 = circle({
    id: '00000000-0000-4000-8000-00000000c003',
    name: 'Family Holiday Fund',
    emoji: 'gift',
    color: 'blush',
    amount: 500,
    slots: 8,
    frequency: 'weekly',
    status: 'forming',
    invite_code: 'PASKO8',
    start_date: day(9),
    created_by: DEMO_USER_ID,
  });
  const m3 = [
    member(c3.id, me, uid(), null, { role: 'admin' }),
    member(c3.id, nena, uid(), null),
    member(c3.id, bea, uid(), null),
    member(c3.id, lia, uid(), null),
    member(c3.id, miguel, uid(), null, { status: 'pending', agreed_at: ago(2) }),
    member(c3.id, kim, uid(), null, { status: 'pending', share: 0.5, agreed_at: ago(1) }),
  ];

  // 4) Tropa Gala Fund — completed
  const c4 = circle({
    id: '00000000-0000-4000-8000-00000000c004',
    name: 'Travel Fund',
    emoji: 'globe',
    color: 'leaf',
    amount: 1500,
    slots: 3,
    frequency: 'weekly',
    status: 'completed',
    invite_code: 'GALA03',
    start_date: day(-80),
    created_by: carlo.id,
  });
  const k = [uid(), uid(), uid()];
  const m4 = [member(c4.id, carlo, k[0], 1, { role: 'admin' }), member(c4.id, me, k[1], 2), member(c4.id, bea, k[2], 3)];
  c4.draw_order = k;
  const s4 = schedule(c4, m4, k, [day(-80), day(-73), day(-66)], null, () => 'confirmed');

  const details: Record<string, CircleDetail> = {
    [c1.id]: { circle: c1, members: m1, rounds: s1.rounds, contributions: s1.contributions, swaps: swaps1 },
    [c2.id]: { circle: c2, members: m2, rounds: s2.rounds, contributions: s2.contributions, swaps: [] },
    [c3.id]: { circle: c3, members: m3, rounds: [], contributions: [], swaps: [] },
    [c4.id]: { circle: c4, members: m4, rounds: s4.rounds, contributions: s4.contributions, swaps: [] },
  };

  const myCircles: MyCircle[] = [c2, c1, c3, c4].map((c) => {
    const d = details[c.id];
    return {
      membership: d.members.find((m) => m.user_id === DEMO_USER_ID)!,
      circle: c,
      rounds: d.rounds,
      contributions: d.contributions.filter((x) => x.user_id === DEMO_USER_ID),
    };
  });

  const A = (circleRef: Circle, actor: Profile | null, type: string, hours: number, payload: Record<string, unknown> = {}): Activity => ({
    id: ++seq,
    circle_id: circleRef.id,
    actor: actor?.id ?? null,
    type,
    payload,
    created_at: ago(hours),
    circles: { name: circleRef.name, emoji: circleRef.emoji, color: circleRef.color },
    profiles: actor ? { full_name: actor.full_name, avatar_emoji: actor.avatar_emoji } : null,
  });
  const activity: Activity[] = [
    A(c3, kim, 'member_requested', 1, { hati: true }),
    A(c3, miguel, 'member_requested', 2),
    A(c2, maria, 'proof_submitted', 5, { amount: 2000 }),
    A(c1, kim, 'proof_submitted', 5, { amount: 500 }),
    A(c1, carlo, 'swap_requested', 20),
    A(c1, bea, 'payment_confirmed', 26, { round_no: 3 }),
    A(c1, maria, 'nudge_sent', 30, { round_no: 3 }),
    A(c2, andrea, 'proof_submitted', 48, { amount: 2000 }),
    A(c3, me, 'member_approved', 60),
    A(c1, null, 'round_completed', 24 * 13, { round_no: 2 }),
    A(c2, null, 'round_completed', 24 * 30, { round_no: 1 }),
    A(c1, null, 'draw_completed', 24 * 33),
    A(c1, maria, 'circle_locked', 24 * 33.2),
    A(c4, null, 'circle_completed', 24 * 66),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const goals: Goal[] = [
    { id: uid(), user_id: DEMO_USER_ID, circle_id: c1.id, title: 'Tuition fee', target: 6000, emoji: 'book-open', deadline: null, plan_amount: null, plan_frequency: null, created_at: ago(200) },
    { id: uid(), user_id: DEMO_USER_ID, circle_id: c2.id, title: 'New laptop', target: 8000, emoji: 'smartphone', deadline: null, plan_amount: null, plan_frequency: null, created_at: ago(100) },
    {
      id: uid(),
      user_id: DEMO_USER_ID,
      circle_id: null,
      title: 'Emergency fund',
      target: 15000,
      emoji: 'shield',
      deadline: day(150),
      plan_amount: 500,
      plan_frequency: 'weekly',
      created_at: ago(24 * 60),
    },
  ];
  const fund = goals[2].id;
  const deposits: Deposit[] = [
    [500, 'Payday ipon', 24 * 2],
    [500, null, 24 * 9],
    [-300, 'Medicine', 24 * 12],
    [500, 'Payday ipon', 24 * 16],
    [1000, '13th month extra', 24 * 23],
    [500, null, 24 * 30],
    [500, null, 24 * 37],
    [2000, 'Starting balance', 24 * 58],
  ].map(([amount, note, h]) => ({ id: uid(), goal_id: fund, user_id: DEMO_USER_ID, amount: amount as number, note: note as string | null, created_at: ago(h as number) }));

  const preview = (c: Circle, members: Member[]): CirclePreview => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    amount: c.amount,
    slots: c.slots,
    frequency: c.frequency,
    start_date: c.start_date,
    late_fee: c.late_fee,
    grace_days: c.grace_days,
    rules: c.rules,
    status: c.status,
    filled: members.filter((m) => m.status === 'approved').reduce((s, m) => s + Number(m.share), 0),
    admin_name: me.full_name,
    admin_tiwala: me.tiwala_score,
    my_status: null,
    has_password: c.has_password,
    interval_days: c.interval_days,
    payout_frequency: c.payout_frequency,
    payout_interval_days: c.payout_interval_days,
    first_payout_date: c.first_payout_date,
  });

  return { profile: me, details, myCircles, activity, goals, deposits, previews: { [c3.invite_code]: preview(c3, m3) } };
}

let cache: ReturnType<typeof build> | null = null;
export const demoData = () => (cache ??= build());

/** Resolve any query key to its demo fixture. */
export async function demoQuery(key: readonly unknown[]): Promise<unknown> {
  const d = demoData();
  await new Promise((r) => setTimeout(r, 250)); // feel like a network call
  switch (key[0]) {
    case 'profile':
      return d.profile;
    case 'my-circles':
      return d.myCircles;
    case 'circle': {
      const detail = d.details[key[1] as string];
      if (!detail) throw new Error('This circle isn’t part of the demo.');
      return detail;
    }
    case 'activity':
      return key[2] === 'all' ? d.activity : d.activity.filter((a) => a.circle_id === key[2]);
    case 'goals':
      return d.goals;
    case 'deposits':
      return d.deposits;
    case 'preview':
      return d.previews[key[1] as string] ?? null;
    case 'receipt':
      return DEMO_RECEIPT;
    default:
      return null;
  }
}

/** Self-contained sample e-wallet receipt (no network needed). */
const RECEIPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<rect width="600" height="900" fill="#F5F6F8"/>
<rect x="40" y="60" width="520" height="780" rx="28" fill="#FFFFFF" stroke="#E4E7EC"/>
<circle cx="300" cy="170" r="44" fill="#E7F4EF"/>
<path d="M280 170 l14 14 l28 -30" stroke="#0E7C5A" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="300" y="260" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#5B6474" text-anchor="middle">Transfer successful</text>
<text x="300" y="330" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="700" fill="#0B0D12" text-anchor="middle">PHP 2,000.00</text>
<line x1="80" y1="390" x2="520" y2="390" stroke="#E4E7EC" stroke-width="2" stroke-dasharray="8 8"/>
<g font-family="Arial, Helvetica, sans-serif" font-size="24">
<text x="80" y="450" fill="#5B6474">Sent to</text><text x="520" y="450" fill="#0B0D12" text-anchor="end">Juan Dela Cruz</text>
<text x="80" y="510" fill="#5B6474">Account</text><text x="520" y="510" fill="#0B0D12" text-anchor="end">0917 555 0101</text>
<text x="80" y="570" fill="#5B6474">From</text><text x="520" y="570" fill="#0B0D12" text-anchor="end">Maria Santos</text>
<text x="80" y="630" fill="#5B6474">Reference no.</text><text x="520" y="630" fill="#0B0D12" text-anchor="end">8812 4410 2231</text>
<text x="80" y="690" fill="#5B6474">Date</text><text x="520" y="690" fill="#0B0D12" text-anchor="end">Today, 9:41 AM</text>
</g>
<text x="300" y="790" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#98A1B0" text-anchor="middle">Sample receipt · demo data</text>
</svg>`;
const DEMO_RECEIPT = `data:image/svg+xml;utf8,${encodeURIComponent(RECEIPT_SVG)}`;
