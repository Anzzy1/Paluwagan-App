import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

import { firstName, peso } from '@/lib/format';
import type { Activity } from '@/lib/types';

type Icon = ComponentProps<typeof Feather>['name'];
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function describeActivity(a: Activity): { icon: Icon; tone: Tone; text: string } {
  const who = firstName(a.profiles?.full_name) || 'May member';
  const p = a.payload as Record<string, string | number | boolean | undefined>;
  switch (a.type) {
    case 'circle_created':
      return { icon: 'star', tone: 'accent', text: `${who} ginawa ang circle` };
    case 'member_requested':
      return { icon: 'user-plus', tone: 'info', text: `${who} nag-request sumali${p.hati ? ' (hati-slot)' : ''}` };
    case 'member_approved':
      return { icon: 'user-check', tone: 'success', text: `${who} nag-approve ng bagong member` };
    case 'member_rejected':
      return { icon: 'user-x', tone: 'neutral', text: `${who} nag-decline ng join request` };
    case 'member_left':
      return { icon: 'log-out', tone: 'neutral', text: `${who} umalis sa circle` };
    case 'hati_paired':
      return { icon: 'users', tone: 'info', text: `${who} nag-pair ng hati-slot` };
    case 'circle_locked':
      return { icon: 'lock', tone: 'info', text: `${who} ni-lock ang circle — handa na ang bunot` };
    case 'circle_unlocked':
      return { icon: 'unlock', tone: 'neutral', text: `${who} ni-unlock ang circle` };
    case 'draw_completed':
      return { icon: 'shuffle', tone: 'accent', text: `Tapos na ang Digital Bunot! 🎲` };
    case 'order_set':
      return { icon: 'list', tone: 'accent', text: `${who} inayos ang pagkakasunod ng sahod` };
    case 'proof_submitted':
      return { icon: 'upload', tone: 'info', text: `${who} nag-upload ng resibo (${peso(Number(p.amount ?? 0))})` };
    case 'payment_confirmed':
      return { icon: 'check-circle', tone: 'success', text: `${who} kinumpirma ang bayad · Round ${p.round_no}` };
    case 'payment_rejected':
      return { icon: 'x-circle', tone: 'danger', text: `${who} ni-reject ang resibo · Round ${p.round_no}` };
    case 'round_completed':
      return { icon: 'award', tone: 'success', text: `Kumpleto na ang Round ${p.round_no}! 💸` };
    case 'circle_completed':
      return { icon: 'flag', tone: 'accent', text: `Tapos na ang buong paluwagan! 🎉` };
    case 'swap_requested':
      return { icon: 'repeat', tone: 'info', text: `${who} nag-request ng palit-slot` };
    case 'swap_accepted':
      return { icon: 'repeat', tone: 'info', text: `${who} pumayag sa palit-slot` };
    case 'swap_declined':
      return { icon: 'repeat', tone: 'neutral', text: `${who} tumanggi sa palit-slot` };
    case 'swap_approved':
      return { icon: 'repeat', tone: 'success', text: `${who} in-approve ang palit-slot` };
    case 'swap_rejected':
      return { icon: 'repeat', tone: 'danger', text: `${who} ni-reject ang palit-slot` };
    case 'nudge_sent':
      return { icon: 'bell', tone: 'warning', text: `${who} nagpadala ng paalala (Round ${p.round_no})` };
    default:
      return { icon: 'circle', tone: 'neutral', text: a.type };
  }
}
