import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

import { firstName, peso } from '@/lib/format';
import type { Activity } from '@/lib/types';

type Icon = ComponentProps<typeof Feather>['name'];
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export function describeActivity(a: Activity): { icon: Icon; tone: Tone; text: string } {
  const who = a.profiles?.full_name ? firstName(a.profiles.full_name) : 'A member';
  const p = a.payload as Record<string, string | number | boolean | undefined>;
  switch (a.type) {
    case 'circle_created':
      return { icon: 'plus-circle', tone: 'brand', text: `${who} created the paluwagan` };
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
    case 'order_set':
      return { icon: 'list', tone: 'brand', text: `${who} set the payout order` };
    case 'proof_submitted':
      return { icon: 'upload', tone: 'info', text: `${who} submitted proof of payment (${peso(Number(p.amount ?? 0))})` };
    case 'payment_confirmed':
      return { icon: 'check-circle', tone: 'success', text: `${who} confirmed a payment for round ${p.round_no}` };
    case 'payment_rejected':
      return { icon: 'x-circle', tone: 'danger', text: `${who} rejected a receipt for round ${p.round_no}` };
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
