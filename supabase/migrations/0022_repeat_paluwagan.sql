-- 0022: start a finished paluwagan again with the same members (a new draw, a new paluwagan).
--
-- The admin asks; every member says yes or no. Once everyone has answered (and at least 3 said
-- yes), the admin starts a new paluwagan with the same settings and the members who said yes.
-- It opens ready to lock and draw, like any new paluwagan.
--
--   request_repeat(circle, name, start)  admin asks (their own answer is yes)
--   answer_repeat(circle, yes)           each member answers
--   cancel_repeat(circle)                admin withdraws the request
--   start_repeat(circle) -> uuid         admin creates the new paluwagan
--
-- Safe to run on top of 0001–0021.

alter table public.circles
  add column if not exists repeat_requested_at timestamptz,
  add column if not exists repeat_name         text check (repeat_name is null or char_length(repeat_name) between 1 and 40),
  add column if not exists repeat_start        date,
  add column if not exists repeat_waiting      int,   -- members who haven't answered yet
  add column if not exists repeat_circle       uuid references public.circles(id) on delete set null;

alter table public.circle_members
  add column if not exists repeat_vote boolean;       -- null = not answered

create or replace function public._repeat_recount(p_circle uuid)
returns void language sql security definer set search_path = public as $$
  update circles set repeat_waiting = (
    select count(*) from circle_members where circle_id = p_circle and status = 'approved' and repeat_vote is null)
  where id = p_circle;
$$;
revoke execute on function public._repeat_recount(uuid) from public, anon, authenticated;

create or replace function public.request_repeat(p_circle uuid, p_name text, p_start date)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can start the paluwagan again'; end if;
  if c.status <> 'completed' then raise exception 'You can start again once every sahod has been released'; end if;
  if c.repeat_circle is not null then raise exception 'This group already started again'; end if;
  if c.repeat_requested_at is not null then raise exception 'You already asked the members'; end if;
  if p_start is null or p_start < (now() at time zone 'Asia/Manila')::date then raise exception 'Pick a start date from today on'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 then raise exception 'Give the new paluwagan a name (up to 40 characters)'; end if;

  update circle_members set repeat_vote = case when user_id = auth.uid() then true end
   where circle_id = p_circle and status = 'approved';
  update circles set repeat_requested_at = now(), repeat_name = trim(p_name), repeat_start = p_start where id = p_circle;
  perform _repeat_recount(p_circle);
  perform log_activity(p_circle, 'repeat_requested', jsonb_build_object('name', trim(p_name), 'start', p_start));
end $$;

create or replace function public.answer_repeat(p_circle uuid, p_yes boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if c.repeat_requested_at is null or c.repeat_circle is not null then raise exception 'There is no request to answer'; end if;
  update circle_members set repeat_vote = p_yes
   where circle_id = p_circle and user_id = auth.uid() and status = 'approved';
  if not found then raise exception 'Only members of this paluwagan can answer'; end if;
  perform _repeat_recount(p_circle);
  perform log_activity(p_circle, 'repeat_answered', jsonb_build_object('yes', p_yes));
end $$;

create or replace function public.cancel_repeat(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can cancel this'; end if;
  if c.repeat_requested_at is null or c.repeat_circle is not null then raise exception 'There is no request to cancel'; end if;
  update circle_members set repeat_vote = null where circle_id = p_circle;
  update circles set repeat_requested_at = null, repeat_name = null, repeat_start = null, repeat_waiting = null where id = p_circle;
  perform log_activity(p_circle, 'repeat_cancelled', '{}'::jsonb);
end $$;

create or replace function public.start_repeat(p_circle uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c circles; yes_n int; waiting int; cid uuid; first_payout date;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can start the paluwagan again'; end if;
  if c.repeat_circle is not null then raise exception 'This group already started again'; end if;
  if c.repeat_requested_at is null then raise exception 'Ask the members first'; end if;
  select count(*) filter (where repeat_vote is null), count(*) filter (where repeat_vote)
    into waiting, yes_n
    from circle_members where circle_id = p_circle and status = 'approved';
  if waiting > 0 then raise exception 'Wait until every member has answered (% left)', waiting; end if;
  if yes_n < 3 then raise exception 'At least 3 members need to say yes to start again'; end if;
  if c.repeat_start < (now() at time zone 'Asia/Manila')::date then raise exception 'The start date has passed. Cancel and ask again with a new date.'; end if;

  -- Same sahod spacing as before: the first sahod keeps its distance from the first hulog.
  first_payout := case when c.first_payout_date is not null then c.repeat_start + (c.first_payout_date - c.start_date) end;

  insert into circles (name, emoji, color, amount, slots, frequency, interval_days, start_date,
                       payout_frequency, payout_interval_days, first_payout_date,
                       late_fee, grace_days, rules, order_mode, draw_style, invite_code, created_by)
  values (c.repeat_name, c.emoji, c.color, c.amount, yes_n, c.frequency, c.interval_days, c.repeat_start,
          c.payout_frequency, c.payout_interval_days, first_payout,
          c.late_fee, c.grace_days, c.rules, c.order_mode, c.draw_style, gen_invite_code(), auth.uid())
  returning id into cid;

  -- Members who said yes, already approved and agreed. The admin stays admin.
  insert into circle_members (circle_id, user_id, role, status, agreed_at)
  select cid, m.user_id, case when m.user_id = auth.uid() then 'admin' else 'member' end, 'approved', now()
    from circle_members m
   where m.circle_id = p_circle and m.status = 'approved' and m.repeat_vote;

  -- Same join password, if there was one.
  insert into circle_passwords (circle_id, hash) select cid, hash from circle_passwords where circle_id = p_circle;
  update circles set has_password = c.has_password where id = cid;

  update circles set repeat_circle = cid, repeat_waiting = 0 where id = p_circle;
  perform log_activity(cid, 'circle_created', jsonb_build_object('name', c.repeat_name, 'repeat_of', p_circle));
  perform log_activity(p_circle, 'repeat_started', jsonb_build_object('name', c.repeat_name, 'circle', cid, 'members', yes_n));
  return cid;
end $$;

revoke all on function public.request_repeat(uuid, text, date) from public, anon;
revoke all on function public.answer_repeat(uuid, boolean) from public, anon;
revoke all on function public.cancel_repeat(uuid) from public, anon;
revoke all on function public.start_repeat(uuid) from public, anon;
grant execute on function public.request_repeat(uuid, text, date) to authenticated;
grant execute on function public.answer_repeat(uuid, boolean) to authenticated;
grant execute on function public.cancel_repeat(uuid) to authenticated;
grant execute on function public.start_repeat(uuid) to authenticated;
