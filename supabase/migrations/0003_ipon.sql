-- Ipon: personal savings goals with their own deposits.
--
-- A goal can still be linked to a circle (its payout counts toward the goal), but now
-- the user can also save on their own: deposits and withdrawals are logged per goal,
-- with an optional savings plan (amount + frequency) and a target date.

alter table public.goals
  add column if not exists deadline       date,
  add column if not exists plan_amount    numeric(12,2) check (plan_amount is null or plan_amount > 0),
  add column if not exists plan_frequency text check (plan_frequency is null or plan_frequency in ('daily','weekly','kinsenas','monthly'));

create table if not exists public.goal_deposits (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.goals on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  -- positive = deposit, negative = withdrawal
  amount     numeric(12,2) not null check (amount <> 0),
  note       text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists goal_deposits_goal_idx on public.goal_deposits (goal_id, created_at desc);
create index if not exists goal_deposits_user_idx on public.goal_deposits (user_id, created_at desc);

alter table public.goal_deposits enable row level security;

drop policy if exists "deposits: own" on public.goal_deposits;
create policy "deposits: own" on public.goal_deposits for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
