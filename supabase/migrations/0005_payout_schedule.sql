-- 0005: separate sahod (payout) schedule per circle.
--
-- Hulog (contributions) keep their own schedule (circles.frequency / interval_days / start_date).
-- A circle can now also have a payout schedule, e.g. daily hulog with a weekly sahod:
-- each round (one payout) then contains one contribution per member per hulog date.
-- When payout_frequency is null, payouts happen on every hulog date (the original behaviour).
-- Safe to run on top of 0001–0004.

alter table public.circles
  add column if not exists payout_frequency     text,
  add column if not exists payout_interval_days int check (payout_interval_days is null or payout_interval_days between 1 and 60),
  add column if not exists first_payout_date    date;

alter table public.circles drop constraint if exists circles_payout_frequency_check;
alter table public.circles add constraint circles_payout_frequency_check
  check (payout_frequency is null or payout_frequency in ('daily','weekly','kinsenas','monthly','custom'));
alter table public.circles drop constraint if exists circles_payout_complete;
alter table public.circles add constraint circles_payout_complete
  check (payout_frequency is null
         or (first_payout_date is not null and first_payout_date >= start_date
             and (payout_frequency <> 'custom' or payout_interval_days is not null)));

-- Each contribution has its own hulog date; a member can have several per round.
alter table public.contributions add column if not exists due_date date;
alter table public.contributions drop constraint if exists contributions_round_id_member_id_key;
alter table public.contributions drop constraint if exists contributions_round_member_due_key;
alter table public.contributions add constraint contributions_round_member_due_key unique (round_id, member_id, due_date);

-- ---------------------------------------------------------------------
-- Round generation. Mirrors payoutPlan() in src/lib/local.ts:
-- hulog dates are assigned to the first payout on or after them;
-- a payout with no hulog date in its period collects one hulog on the payout date.
-- ---------------------------------------------------------------------
create or replace function public._add_hulog(p_round uuid, p_circle uuid, p_amount numeric, p_group uuid, p_due date)
returns void language sql security definer set search_path = public as $$
  insert into contributions (round_id, circle_id, member_id, user_id, amount, status, auto, confirmed_at, due_date)
  select p_round, p_circle, m.id, m.user_id, p_amount * m.share,
         case when m.slot_group = p_group then 'confirmed' else 'pending' end,
         m.slot_group = p_group,
         case when m.slot_group = p_group then now() end,
         p_due
  from circle_members m where m.circle_id = p_circle and m.status = 'approved';
$$;
revoke execute on function public._add_hulog(uuid, uuid, numeric, uuid, date) from public, anon, authenticated;

create or replace function public._start_circle(p_circle uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare c circles; g uuid; k int := 0; rid uuid; pdate date; d date; j int := 1; n int;
begin
  select * into c from circles where id = p_circle;
  foreach g in array p_order loop
    k := k + 1;
    update circle_members set slot_no = k where circle_id = p_circle and slot_group = g and status = 'approved';

    if c.payout_frequency is null then
      pdate := round_due_date(c.frequency, c.start_date, k, c.interval_days);
    else
      pdate := round_due_date(c.payout_frequency, c.first_payout_date, k, c.payout_interval_days);
    end if;

    insert into rounds (circle_id, round_no, slot_group, due_date, status)
    values (p_circle, k, g, pdate, case when k = 1 then 'active' else 'upcoming' end)
    returning id into rid;

    if c.payout_frequency is null then
      perform _add_hulog(rid, p_circle, c.amount, g, pdate);
    else
      n := 0;
      loop
        d := round_due_date(c.frequency, c.start_date, j, c.interval_days);
        exit when d > pdate or j > 5000;
        perform _add_hulog(rid, p_circle, c.amount, g, d);
        n := n + 1;
        j := j + 1;
      end loop;
      if n = 0 then perform _add_hulog(rid, p_circle, c.amount, g, pdate); end if;
    end if;
  end loop;
  update circles set status = 'active' where id = p_circle;
end $$;
revoke execute on function public._start_circle(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- On-time is now judged against each contribution's own hulog date.
-- (Same as 0001 otherwise.)
-- ---------------------------------------------------------------------
create or replace function public.review_contribution(p_contribution uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions; r rounds; c circles; is_recipient boolean; nxt uuid;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found then raise exception 'Not found'; end if;
  select * into r from rounds where id = k.round_id;
  select * into c from circles where id = k.circle_id;
  is_recipient := exists (select 1 from circle_members where slot_group = r.slot_group
                          and user_id = auth.uid() and status = 'approved');
  if not (is_recipient or is_admin(k.circle_id)) then raise exception 'Recipient or admin only'; end if;
  if k.status not in ('submitted', 'pending') then raise exception 'Nothing to review'; end if;

  if p_approve then
    update contributions set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
           on_time = coalesce(submitted_at, now())::date <= coalesce(k.due_date, r.due_date) + c.grace_days
     where id = p_contribution;
    perform recompute_tiwala(k.user_id);
    perform log_activity(k.circle_id, 'payment_confirmed',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'amount', k.amount));

    if not exists (select 1 from contributions where round_id = r.id and status <> 'confirmed') then
      update rounds set status = 'completed', completed_at = now() where id = r.id;
      perform log_activity(k.circle_id, 'round_completed', jsonb_build_object('round_no', r.round_no));
      select id into nxt from rounds where circle_id = r.circle_id and status = 'upcoming'
        order by round_no limit 1;
      if nxt is null then
        if not exists (select 1 from rounds where circle_id = r.circle_id and status <> 'completed') then
          update circles set status = 'completed' where id = r.circle_id;
          perform log_activity(k.circle_id, 'circle_completed');
        end if;
      elsif not exists (select 1 from rounds where circle_id = r.circle_id and status = 'active') then
        update rounds set status = 'active' where id = nxt;
      end if;
    end if;
  else
    update contributions set status = 'rejected', reject_reason = p_reason where id = p_contribution;
    perform log_activity(k.circle_id, 'payment_rejected',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'reason', p_reason));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- create_circle: + payout schedule
-- ---------------------------------------------------------------------
drop function if exists public.create_circle(text, text, text, numeric, int, text, date, numeric, int, text, text, int, text);
create or replace function public.create_circle(
  p_name text, p_emoji text, p_color text, p_amount numeric, p_slots int,
  p_frequency text, p_start_date date, p_late_fee numeric, p_grace_days int,
  p_rules text, p_order_mode text, p_interval_days int default null, p_password text default null,
  p_payout_frequency text default null, p_payout_interval int default null, p_first_payout date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_frequency = 'custom' and (p_interval_days is null or p_interval_days not between 1 and 60) then
    raise exception 'Choose how many days between payments (1 to 60)';
  end if;
  if p_payout_frequency is not null then
    if p_first_payout is null then raise exception 'Choose the date of the first sahod'; end if;
    if p_first_payout < p_start_date then raise exception 'The first sahod can’t be before the first hulog'; end if;
    if p_payout_frequency = 'custom' and (p_payout_interval is null or p_payout_interval not between 1 and 60) then
      raise exception 'Choose how many days between payouts (1 to 60)';
    end if;
  end if;

  insert into circles (name, emoji, color, amount, slots, frequency, interval_days, start_date,
                       payout_frequency, payout_interval_days, first_payout_date,
                       late_fee, grace_days, rules, order_mode, invite_code, created_by)
  values (trim(p_name), p_emoji, p_color, p_amount, p_slots, p_frequency,
          case when p_frequency = 'custom' then p_interval_days end, p_start_date,
          p_payout_frequency,
          case when p_payout_frequency = 'custom' then p_payout_interval end,
          case when p_payout_frequency is not null then p_first_payout end,
          coalesce(p_late_fee, 0), coalesce(p_grace_days, 0), coalesce(p_rules, ''),
          coalesce(p_order_mode, 'draw'), gen_invite_code(), auth.uid())
  returning id into cid;

  insert into circle_members (circle_id, user_id, role, status, agreed_at)
  values (cid, auth.uid(), 'admin', 'approved', now());

  perform _set_password(cid, p_password);
  perform log_activity(cid, 'circle_created', jsonb_build_object('name', p_name));
  return cid;
end $$;

-- ---------------------------------------------------------------------
-- preview_circle: + payout schedule
-- ---------------------------------------------------------------------
drop function if exists public.preview_circle(text);
create or replace function public.preview_circle(p_code text)
returns table (
  id uuid, name text, emoji text, color text, amount numeric, slots int, frequency text,
  start_date date, late_fee numeric, grace_days int, rules text, status text,
  filled numeric, admin_name text, admin_tiwala int, my_status text,
  has_password boolean, interval_days int,
  payout_frequency text, payout_interval_days int, first_payout_date date
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, c.color, c.amount, c.slots, c.frequency, c.start_date,
         c.late_fee, c.grace_days, c.rules, c.status,
         coalesce((select sum(share) from circle_members m
                   where m.circle_id = c.id and m.status = 'approved'), 0),
         p.full_name, p.tiwala_score,
         (select m.status from circle_members m where m.circle_id = c.id and m.user_id = auth.uid()),
         c.has_password, c.interval_days,
         c.payout_frequency, c.payout_interval_days, c.first_payout_date
  from circles c
  join profiles p on p.id = c.created_by
  where c.invite_code = upper(trim(p_code));
$$;
