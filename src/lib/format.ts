import type { Circle, Contribution, DisplayStatus, Frequency, Member, Round } from '@/lib/types';

export function peso(n: number | string, opts: { compact?: boolean } = {}): string {
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

export function todayISO(): string {
  return toISODate(new Date());
}

export function daysUntil(d: string): number {
  const today = parseDate(todayISO()).getTime();
  return Math.round((parseDate(d).getTime() - today) / 86_400_000);
}

export function relativeDue(d: string, lang: 'fil' | 'en' = 'fil'): string {
  const n = daysUntil(d);
  if (lang === 'en') {
    if (n === 0) return 'Due today';
    if (n === 1) return 'Due tomorrow';
    if (n > 1) return `In ${n} days`;
    return `${-n} day${n === -1 ? '' : 's'} overdue`;
  }
  if (n === 0) return 'Ngayon ang due';
  if (n === 1) return 'Bukas ang due';
  if (n > 1) return `${n} araw pa`;
  return `${-n} araw nang late`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ngayon lang';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return shortDate(iso.slice(0, 10));
}

export const frequencyLabel: Record<Frequency, { fil: string; en: string }> = {
  weekly: { fil: 'Lingguhan', en: 'Weekly' },
  kinsenas: { fil: 'Kinsenas (15 & 30)', en: 'Kinsenas (15th & 30th)' },
  monthly: { fil: 'Buwanan', en: 'Monthly' },
};

export function potOf(c: Pick<Circle, 'amount' | 'slots'>): number {
  return Number(c.amount) * c.slots;
}

export function displayStatus(k: Contribution, round: Round, circle: Pick<Circle, 'grace_days'>): DisplayStatus {
  if (k.status === 'pending' || k.status === 'rejected') {
    const overdue = daysUntil(round.due_date) < -circle.grace_days;
    if (overdue) return 'late';
  }
  return k.status;
}

/** Group approved members by slot (hati partners share a slot). */
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
  return n.trim().split(/\s+/)[0];
}

/** Words that commonly appear in investment-scam "paluwagan" pitches. */
const SCAM_WORDS = /\b(tubo|interest|interes|return|doble|double|tripl|profit|kita\s*agad|investment|invest|guaranteed)\b/i;
export function looksLikeScam(text: string): boolean {
  return SCAM_WORDS.test(text);
}

export function tiwalaLabel(score: number) {
  if (score >= 95) return { label: 'Super Maaasahan', emoji: '💎' };
  if (score >= 85) return { label: 'Maaasahan', emoji: '🌟' };
  if (score >= 70) return { label: 'Okay naman', emoji: '👍' };
  if (score >= 50) return { label: 'Madalas ma-late', emoji: '⏰' };
  return { label: 'Ingat', emoji: '⚠️' };
}
