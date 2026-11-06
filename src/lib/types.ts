import type { CircleTint } from '@/theme/tokens';

export type Frequency = 'weekly' | 'kinsenas' | 'monthly';
export type CircleStatus = 'forming' | 'locked' | 'active' | 'completed';
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'left';
export type ContributionStatus = 'pending' | 'submitted' | 'confirmed' | 'rejected';
export type DisplayStatus = ContributionStatus | 'late';
export type RoundStatus = 'upcoming' | 'active' | 'completed';
export type SwapStatus = 'pending' | 'accepted' | 'declined' | 'approved' | 'rejected' | 'cancelled';

export type Profile = {
  id: string;
  full_name: string;
  avatar_emoji: string;
  phone: string | null;
  gcash_number: string | null;
  tiwala_score: number;
  push_token: string | null;
};

export type Circle = {
  id: string;
  name: string;
  emoji: string;
  color: CircleTint;
  amount: number;
  slots: number;
  frequency: Frequency;
  start_date: string;
  late_fee: number;
  grace_days: number;
  rules: string;
  order_mode: 'draw' | 'manual';
  status: CircleStatus;
  invite_code: string;
  seed_hash: string | null;
  seed: string | null;
  draw_order: string[] | null;
  drawn_at: string | null;
  created_by: string;
  created_at: string;
};

export type Member = {
  id: string;
  circle_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: MemberStatus;
  share: number;
  slot_group: string;
  slot_no: number | null;
  agreed_at: string | null;
  joined_at: string;
  profiles: Profile | null;
};

export type Round = {
  id: string;
  circle_id: string;
  round_no: number;
  slot_group: string;
  due_date: string;
  status: RoundStatus;
  completed_at: string | null;
};

export type Contribution = {
  id: string;
  round_id: string;
  circle_id: string;
  member_id: string;
  user_id: string;
  amount: number;
  status: ContributionStatus;
  auto: boolean;
  proof_path: string | null;
  note: string | null;
  reject_reason: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  on_time: boolean | null;
};

export type Swap = {
  id: string;
  circle_id: string;
  from_member: string;
  to_member: string;
  status: SwapStatus;
  created_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  circle_id: string | null;
  title: string;
  target: number;
  emoji: string;
  created_at: string;
};

export type Activity = {
  id: number;
  circle_id: string;
  actor: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  circles?: Pick<Circle, 'name' | 'emoji' | 'color'> | null;
  profiles?: Pick<Profile, 'full_name' | 'avatar_emoji'> | null;
};

export type CirclePreview = {
  id: string;
  name: string;
  emoji: string;
  color: CircleTint;
  amount: number;
  slots: number;
  frequency: Frequency;
  start_date: string;
  late_fee: number;
  grace_days: number;
  rules: string;
  status: CircleStatus;
  filled: number;
  admin_name: string;
  admin_tiwala: number;
  my_status: MemberStatus | null;
};
