-- 0011: preview_circle also returns how many people have joined.
-- `filled` counts slots (split-slot members are half a slot each), which isn't a head count.
-- Safe to run on top of 0001–0010.

drop function if exists public.preview_circle(text);
create or replace function public.preview_circle(p_code text)
returns table (
  id uuid, name text, emoji text, color text, amount numeric, slots int, frequency text,
  start_date date, late_fee numeric, grace_days int, rules text, status text,
  filled numeric, admin_name text, admin_tiwala int, my_status text,
  has_password boolean, interval_days int,
  payout_frequency text, payout_interval_days int, first_payout_date date,
  replacing boolean, joined int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, c.color, c.amount, c.slots, c.frequency, c.start_date,
         c.late_fee, c.grace_days, c.rules, c.status,
         coalesce((select sum(share) from circle_members m
                   where m.circle_id = c.id and m.status = 'approved'), 0),
         p.full_name, p.tiwala_score,
         (select m.status from circle_members m where m.circle_id = c.id and m.user_id = auth.uid()),
         c.has_password, c.interval_days,
         c.payout_frequency, c.payout_interval_days, c.first_payout_date,
         c.status = 'active' and c.replacing_member is not null,
         (select count(*)::int from circle_members m where m.circle_id = c.id and m.status = 'approved')
  from circles c
  join profiles p on p.id = c.created_by
  where c.invite_code = upper(trim(p_code));
$$;
grant execute on function public.preview_circle(text) to authenticated;
