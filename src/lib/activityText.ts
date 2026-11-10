import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

import { firstName, peso } from '@/lib/format';
import type { Activity } from '@/lib/types';

type Icon = ComponentProps<typeof Feather>['name'];
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

/** Icon + tone for a managed paluwagan log line (those are stored as plain text). */
function describeManagedLog(text: string): { icon: Icon; tone: Tone; text: string } {
  const t = text.toLowerCase();
  if (t.startsWith('undone')) return { icon: 'rotate-ccw', tone: 'warning', text };
  if (t.includes('released')) return { icon: 'gift', tone: 'brand', text };
  if (t.includes('sahod moved')) return { icon: 'clock', tone: 'warning', text };
  if (t.includes('marked unpaid')) return { icon: 'x-circle', tone: 'neutral', text };
  if (t.includes('marked paid') || t.includes(' paid for ')) return { icon: 'check-circle', tone: t.includes('(late)') ? 'warning' : 'success', text };
  if (t.includes('draw')) return { icon: 'shuffle', tone: 'brand', text };
  if (t.endsWith(' added')) return { icon: 'user-plus', tone: 'info', text };
  if (t.endsWith(' removed')) return { icon: 'user-minus', tone: 'neutral', text };
  if (t.includes('created')) return { icon: 'plus-circle', tone: 'brand', text };
  return { icon: 'circle', tone: 'neutral', text };
}

export function describeActivity(a: Activity): { icon: Icon; tone: Tone; text: string } {
  const who = a.profiles?.full_name ? firstName(a.profiles.full_name) : 'A member';
  const p = a.payload as Record<string, string | number | boolean | undefined>;
  switch (a.type) {
    case 'managed_log':
      return describeManagedLog(String(p.text ?? ''));
    case 'circle_created':
      return { icon: 'plus-circle', tone: 'brand', text: p.repeat_of ? `${who} started this paluwagan again with the same group` : `${who} created the paluwagan` };
    case 'repeat_requested':
      return { icon: 'refresh-cw', tone: 'brand', text: `${who} asked everyone to start the paluwagan again as “${p.name}” on ${p.start}. Members need to answer.` };
    case 'repeat_answered':
      return { icon: p.yes ? 'thumbs-up' : 'thumbs-down', tone: p.yes ? 'success' : 'neutral', text: `${who} ${p.yes ? 'is in for' : 'is sitting out'} the next paluwagan` };
    case 'repeat_cancelled':
      return { icon: 'x-circle', tone: 'neutral', text: `${who} cancelled starting the paluwagan again` };
    case 'repeat_started':
      return { icon: 'refresh-cw', tone: 'success', text: `${who} started “${p.name}” with ${p.members} members. A new draw comes next.` };
    case 'member_requested':
      return { icon: 'user-plus', tone: 'info', text: `${who} requested to join${p.hati ? ' (split slot)' : ''}` };
    case 'member_approved':
      return { icon: 'user-check', tone: 'success', text: `${who} approved a new member` };
    case 'member_rejected':
      return { icon: 'user-x', tone: 'neutral', text: `${who} declined a join request` };
    case 'member_left':
      return { icon: 'log-out', tone: 'neutral', text: `${who} left the paluwagan` };
    case 'hati_paired':
      return { icon: 'users', tone: 'info', text: `${who} paired a split slot` };
    case 'circle_locked':
      return { icon: 'lock', tone: 'info', text: `${who} locked the paluwagan and published the draw commitment` };
    case 'circle_deleted':
      return { icon: 'trash-2', tone: 'danger', text: `${who} deleted the paluwagan` };
    case 'circle_restored':
      return { icon: 'rotate-ccw', tone: 'success', text: `${who} restored the paluwagan` };
    case 'circle_paused':
      return { icon: 'pause-circle', tone: 'warning', text: `${who} paused the paluwagan${p.reason ? `: “${p.reason}”` : ''}` };
    case 'circle_resumed':
      return { icon: 'play-circle', tone: 'success', text: `${who} resumed the paluwagan${Number(p.days) > 0 ? `. Dates moved ${p.days} day${Number(p.days) === 1 ? '' : 's'} later` : ''}` };
    case 'circle_unlocked':
      return { icon: 'unlock', tone: 'neutral', text: `${who} unlocked the paluwagan` };
    case 'draw_completed':
      return { icon: 'shuffle', tone: 'brand', text: 'The draw was completed and the payout order is set' };
    case 'draw_redone':
      return { icon: 'rotate-ccw', tone: 'warning', text: `${who} redid the draw before anyone paid. A new secret seed was locked in.` };
    case 'draw_revealed':
      return { icon: 'eye', tone: 'brand', text: 'The payout order is out. Payments are now open.' };
    case 'order_set':
      return { icon: 'list', tone: 'brand', text: `${who} set the payout order` };
    case 'proof_submitted':
      return { icon: 'upload', tone: 'info', text: `${who} submitted proof of payment (${peso(Number(p.amount ?? 0))})` };
    case 'payment_confirmed':
      return { icon: 'check-circle', tone: 'success', text: `${who} confirmed a payment for round ${p.round_no}` };
    case 'payment_rejected':
      return { icon: 'x-circle', tone: 'danger', text: `${who} rejected a receipt for round ${p.round_no}` };
    case 'round_released':
      return {
        icon: 'gift',
        tone: Number(p.unpaid) > 0 ? 'warning' : 'success',
        text: `${who} released the sahod for round ${p.round_no}${Number(p.unpaid) > 0 ? ` with ${p.unpaid} unpaid hulog (${peso(Number(p.unpaid_amount ?? 0))}) still owed` : ''}`,
      };
    case 'sahod_advanced': {
      const given = p.given != null ? Number(p.given) : null;
      const balance = given != null && p.pot != null ? Number(p.pot) - given : 0;
      const shift = Number(p.shift ?? 0);
      return {
        icon: 'fast-forward',
        tone: 'brand',
        text: `${who} advanced the sahod for round ${p.round_no} (planned for ${p.due})${given != null ? `: ${peso(given)} given now` : ''}${
          balance > 0 ? `, ${peso(balance)} balance to follow` : ''
        }${shift > 0 ? `. Hulog continues ${p.resume}, later dates moved ${shift} day${shift === 1 ? '' : 's'}` : ''}${
          given == null && Number(p.unpaid) > 0 ? ` with ${p.unpaid} unpaid hulog still owed` : ''
        }`,
      };
    }
    case 'sahod_balance_released':
      return { icon: 'gift', tone: 'success', text: `${who} gave the ${peso(Number(p.amount ?? 0))} sahod balance for round ${p.round_no}` };
    case 'sahod_delayed':
      return { icon: 'clock', tone: 'warning', text: `${who} moved the round ${p.round_no} sahod from ${p.from} to ${p.to}${p.shift_later ? ', and later sahod too' : ''}` };
    case 'payment_covered':
      return { icon: 'shield', tone: 'warning', text: `${who} covered a missed hulog for round ${p.round_no} (${peso(Number(p.amount ?? 0))})` };
    case 'replacement_opened':
      return { icon: 'user-minus', tone: 'warning', text: `${who} opened a slot to replace a member` };
    case 'member_replaced':
      return { icon: 'user-check', tone: 'info', text: `${who} replaced a member. The new member takes over their remaining hulog and payout` };
    case 'round_completed':
      return { icon: 'award', tone: 'success', text: `Round ${p.round_no} is fully paid` };
    case 'circle_completed':
      return { icon: 'flag', tone: 'brand', text: 'All rounds are complete. The paluwagan has finished.' };
    case 'swap_requested':
      return { icon: 'repeat', tone: 'info', text: `${who} requested a turn swap` };
    case 'swap_accepted':
      return { icon: 'repeat', tone: 'info', text: `${who} accepted a turn swap` };
    case 'swap_declined':
      return { icon: 'repeat', tone: 'neutral', text: `${who} declined a turn swap` };
    case 'swap_approved':
      return { icon: 'repeat', tone: 'success', text: `${who} approved a turn swap` };
    case 'swap_rejected':
      return { icon: 'repeat', tone: 'danger', text: `${who} rejected a turn swap` };
    case 'nudge_sent':
      return { icon: 'bell', tone: 'warning', text: `${who} sent a payment reminder for round ${p.round_no}` };
    case 'password_changed':
      return { icon: 'lock', tone: 'info', text: `${who} changed the join password` };
    default:
      return { icon: 'circle', tone: 'neutral', text: a.type };
  }
}
