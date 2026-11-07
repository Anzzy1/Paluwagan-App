import { settings } from '@/lib/prefs';
import type { Circle, Contribution, DisplayStatus, Frequency, Member, Round } from '@/lib/types';

/** Formats pesos for display; shows ₱••• when "Hide amounts" is on. */
export function peso(n: number | string, opts: { compact?: boolean } = {}): string {
  if (settings.hideAmounts) return '₱•••';
  return pesoRaw(n, opts);
}

/** Always the real figure (for data sent to the AI, exports, etc.). */
export function pesoRaw(n: number | string, opts: { compact?: boolean } = {}): string {
  const v = Number(n) || 0;
  if (opts.compact && Math.abs(v) >= 1000) {
    const k = v / 1000;
    return '₱' + (Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }
  const fixed = Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2);
  const [whole, dec] = fixed.split('.');
  return '₱' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses 'YYYY-MM-DD' as a local calendar date (no timezone shift). */
export function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shortDate(d: string): string {
  const x = parseDate(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
}

export function longDate(d: string): string {
  const x = parseDate(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${longDate(toISODate(d))}, ${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function daysUntil(d: string): number {
  const today = parseDate(todayISO()).getTime();
  return Math.round((parseDate(d).getTime() - today) / 86_400_000);
}

export function relativeDue(d: string): string {
  const n = daysUntil(d);
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n > 1) return `Due in ${n} days`;
  return `${-n} day${n === -1 ? '' : 's'} overdue`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return shortDate(iso.slice(0, 10));
}

type Schedule = { frequency: Frequency; interval_days?: number | null };

/** Full schedule description, e.g. "Every 3 days" or "Twice a month (15th & 30th)". */
export function scheduleLabel({ frequency, interval_days }: Schedule): string {
  switch (frequency) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return 'Every week';
    case 'kinsenas':
      return 'Twice a month (15th & 30th)';
    case 'monthly':
      return 'Every month';
    case 'custom': {
      const n = interval_days ?? 1;
      return n === 1 ? 'Every day' : `Every ${n} days`;
    }
  }
}

/** Compact schedule label for cards and lists. */
export function scheduleShort({ frequency, interval_days }: Schedule): string {
  switch (frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'kinsenas':
      return 'Semi-monthly';
    case 'monthly':
      return 'Monthly';
    case 'custom': {
      const n = interval_days ?? 1;
      return n === 1 ? 'Daily' : `Every ${n} days`;
    }
  }
}

export function potOf(c: Pick<Circle, 'amount' | 'slots'>): number {
  return Number(c.amount) * c.slots;
}

export function displayStatus(k: Contribution, round: Round, circle: Pick<Circle, 'grace_days'>): DisplayStatus {
  if (k.status === 'pending' || k.status === 'rejected') {
    if (daysUntil(k.due_date ?? round.due_date) < -circle.grace_days) return 'late';
  }
  return k.status;
}

/** Group approved members by slot (split-slot partners share one). */
export function slotsOf(members: Member[]): { group: string; slotNo: number | null; members: Member[] }[] {
  const map = new Map<string, Member[]>();
  for (const m of members) {
    if (m.status !== 'approved') continue;
    const arr = map.get(m.slot_group) ?? [];
    arr.push(m);
    map.set(m.slot_group, arr);
  }
  return [...map.entries()]
    .map(([group, ms]) => ({ group, slotNo: ms[0].slot_no, members: ms }))
    .sort((a, b) => (a.slotNo ?? 999) - (b.slotNo ?? 999) || a.members[0].joined_at.localeCompare(b.members[0].joined_at));
}

export function slotName(ms: Member[]): string {
  return ms.map((m) => firstName(m.profiles?.full_name)).join(' & ');
}

export function firstName(n?: string | null): string {
  if (!n) return 'Member';
  const t = n.trim();
  if (/^Guest [0-9A-F]{4}$/.test(t)) return t; // keep test guests distinguishable
  return t.split(/\s+/)[0];
}

export function initials(n?: string | null): string {
  if (!n?.trim()) return '?';
  const parts = n.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Words that commonly appear in investment-scam "paluwagan" pitches. */
const SCAM_WORDS = /\b(tubo|interest|interes|returns?|doble|double|tripl\w*|profit|kita\s*agad|investment|invest|guaranteed)\b/i;
export function looksLikeScam(text: string): boolean {
  return SCAM_WORDS.test(text);
}

export function trustLabel(score: number): { label: string; tone: 'success' | 'info' | 'warning' | 'danger' } {
  if (score >= 95) return { label: 'Excellent', tone: 'success' };
  if (score >= 85) return { label: 'Very good', tone: 'success' };
  if (score >= 70) return { label: 'Good', tone: 'info' };
  if (score >= 50) return { label: 'Fair', tone: 'warning' };
  return { label: 'Needs attention', tone: 'danger' };
}

type WithPayout = Schedule & {
  /** Offline circles. */
  payout?: { frequency: Frequency; interval_days: number | null } | null;
  /** Online circles. */
  payout_frequency?: Frequency | null;
  payout_interval_days?: number | null;
};

/** The circle's sahod (payout) schedule, or null when payouts happen on every hulog date. */
export function payoutOf(c: WithPayout): Schedule | null {
  if (c.payout) return { frequency: c.payout.frequency, interval_days: c.payout.interval_days };
  if (c.payout_frequency) return { frequency: c.payout_frequency, interval_days: c.payout_interval_days ?? null };
  return null;
}

/** "Daily" or, with a separate payout schedule, "Daily hulog · weekly sahod". */
export function payoutShort(c: WithPayout): string {
  const p = payoutOf(c);
  if (!p) return scheduleShort(c);
  return `${scheduleShort(c)} hulog · ${scheduleShort(p).toLowerCase()} sahod`;
}
