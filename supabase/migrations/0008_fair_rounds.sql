-- 0008: fairer online paluwagan.
--
-- 1. No one can confirm their own payment, not even the admin (the recipient confirms it).
-- 2. One unpaid member no longer stalls everyone: once the sahod date arrives, the admin can
--    release the round and move on. Unpaid hulog stay on record as overdue and can still be
--    paid and confirmed later.
-- 3. A member who runs away can be handled: the admin can cover a hulog, or open the slot
--    for a replacement who takes over that member's remaining hulog and payout.
-- 4. Trust Score now drops for missed hulog (unpaid past due + grace) and covered hulog,
--    not only for late confirmed ones.
-- 5. The late fee is recorded on each late contribution.
--
-- Safe to run on top of 0001–0007.

alter table public.contributions
  add column if not exists late_fee   numeric(12,2) not null default 0 check (late_fee >= 0),
  add column if not exists covered_by uuid references public.profiles(id);

-- The member whose slot is open for a replacement (join requests are accepted while set).
alter table public.circles
  add column if not exists replacing_member uuid references public.circle_members(id) on delete set null;

-- ---------------------------------------------------------------------
-- Trust Score: on-time payments vs everything that was due.
-- Missed = still unpaid (pending/rejected) after due date + grace days.
-- Covered by the organizer counts as missed for the payer.
-- ---------------------------------------------------------------------
create or replace function public.recompute_tiwala(u uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total int; good int;
begin
  select count(*), count(*) filter (where k.status = 'confirmed' and k.on_time and k.covered_by is null)
    into total, good
    from contributions k
    join rounds r on r.id = k.round_id
    join circles c on c.id = k.circle_id
   where k.user_id = u and not k.auto and c.deleted_at is null
     and ((k.status = 'confirmed' and k.on_time is not null)
          or (k.status in ('pending', 'rejected')
              and coalesce(k.due_date, r.due_date) + c.grace_days < (now() at time zone 'Asia/Manila')::date));
  -- Bayesian prior: new users start at 80
  update profiles set tiwala_score = round(100.0 * (good + 4) / (total + 5)) where id = u;
end $$;
revoke execute on function public.recompute_tiwala(uuid) from public, anon, authenticated;

-- Members can refresh their own score (e.g. when a missed hulog passes its grace period).
create or replace function public.refresh_my_tiwala() returns void
language sql security definer set search_path = public as $$
  select recompute_tiwala(auth.uid()) where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------
-- Shared: complete a round once every hulog is confirmed, then move to the next one.
-- Only for rounds that are still open (paying old arrears never reopens anything).
-- ---------------------------------------------------------------------
create or replace function public._finish_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rounds;
begin
  select * into r from rounds where id = p_round for update;
  if r.status = 'completed' then return; end if;
  if exists (select 1 from contributions where round_id = r.id and status <> 'confirmed') then return; end if;
  update rounds set status = 'completed', completed_at = now() where id = r.id;
  perform log_activity(r.circle_id, 'round_completed', jsonb_build_object('round_no', r.round_no));
  perform _activate_next(r.circle_id);
end $$;
revoke execute on function public._finish_round(uuid) from public, anon, authenticated;

create or replace function public._activate_next(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare nxt uuid;
begin
  if exists (select 1 from rounds where circle_id = p_circle and status = 'active') then return; end if;
  select id into nxt from rounds where circle_id = p_circle and status = 'upcoming' order by round_no limit 1;
  if nxt is not null then
    update rounds set status = 'active' where id = nxt;
  elsif not exists (select 1 from rounds where circle_id = p_circle and status <> 'completed') then
    update circles set status = 'completed' where id = p_circle;
    perform log_activity(p_circle, 'circle_completed');
  end if;
end $$;
revoke execute on function public._activate_next(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Confirm / reject a payment. Recipient or admin, but never the payer themselves.
-- ---------------------------------------------------------------------
create or replace function public.review_contribution(p_contribution uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions; r rounds; c circles; is_recipient boolean; late boolean;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found then raise exception 'Not found'; end if;
  select * into r from rounds where id = k.round_id;
  select * into c from circles where id = k.circle_id;
  is_recipient := exists (select 1 from circle_members where slot_group = r.slot_group
                          and user_id = auth.uid() and status = 'approved');
  if not (is_recipient or is_admin(k.circle_id)) then raise exception 'Recipient or admin only'; end if;
  if k.user_id = auth.uid() then
    raise exception 'You can’t confirm your own payment. The payout recipient confirms it.';
  end if;
  if k.status not in ('submitted', 'pending') then raise exception 'Nothing to review'; end if;

  if p_approve then
    late := coalesce(k.submitted_at, now())::date > coalesce(k.due_date, r.due_date) + c.grace_days;
    update contributions set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
           on_time = not late,
           late_fee = case when late then c.late_fee else 0 end
     where id = p_contribution;
    perform recompute_tiwala(k.user_id);
    perform log_activity(k.circle_id, 'payment_confirmed',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'amount', k.amount,
                         'late_fee', case when late then c.late_fee else 0 end));
    perform _finish_round(r.id);
  else
    update contributions set status = 'rejected', reject_reason = p_reason where id = p_contribution;
    perform log_activity(k.circle_id, 'payment_rejected',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'reason', p_reason));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Release the current sahod and move on, even if some hulog are still unpaid.
-- Admin only, and only once the sahod date has arrived.
-- ---------------------------------------------------------------------
create or replace function public.release_round(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c circles; r rounds; unpaid_n int; unpaid_amt numeric; u uuid;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can release the sahod'; end if;
  if c.status <> 'active' then raise exception 'This paluwagan is not running'; end if;
  if c.paused_at is not null then raise exception 'Resume the paluwagan first'; end if;
  select * into r from rounds where circle_id = p_circle and status = 'active' for update;
  if not found then raise exception 'There is no current round'; end if;
  if r.due_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The sahod date for this round hasn’t arrived yet';
  end if;

  select count(*), coalesce(sum(amount), 0) into unpaid_n, unpaid_amt
    from contributions where round_id = r.id and status <> 'confirmed';

  update rounds set status = 'completed', completed_at = now() where id = r.id;
  perform log_activity(p_circle, 'round_released',
    jsonb_build_object('round_no', r.round_no, 'unpaid', unpaid_n, 'unpaid_amount', unpaid_amt));
  perform _activate_next(p_circle);

  -- Missed hulog now count against the members who didn't pay.
  for u in select distinct user_id from contributions where round_id = r.id and status <> 'confirmed' loop
    perform recompute_tiwala(u);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- The organizer pays a member's hulog for them (e.g. the member ran away).
-- Counts as missed for that member's Trust Score.
-- ---------------------------------------------------------------------
create or replace function public.cover_contribution(p_contribution uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions; r rounds; c circles; late boolean;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found then raise exception 'Not found'; end if;
  if not is_admin(k.circle_id) then raise exception 'Only the admin can cover a hulog'; end if;
  if k.user_id = auth.uid() then raise exception 'Pay your own hulog the usual way'; end if;
  if k.status not in ('pending', 'rejected') then raise exception 'This hulog is already paid or waiting for review'; end if;
  select * into r from rounds where id = k.round_id;
  select * into c from circles where id = k.circle_id;
  late := (now() at time zone 'Asia/Manila')::date > coalesce(k.due_date, r.due_date) + c.grace_days;

  update contributions set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
         covered_by = auth.uid(), on_time = false,
         late_fee = case when late then c.late_fee else 0 end,
         note = coalesce(nullif(trim(p_note), ''), 'Covered by the organizer'), reject_reason = null
   where id = p_contribution;
  perform recompute_tiwala(k.user_id);
  perform log_activity(k.circle_id, 'payment_covered',
    jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'amount', k.amount));
  perform _finish_round(r.id);
end $$;

-- ---------------------------------------------------------------------
-- Replacing a member while the paluwagan runs.
--   1. open_replacement(member): the slot opens; the invite code accepts join requests again.
--   2. The new person requests to join with the code.
--   3. replace_member(new pending member): they take over the old member's slot, payout and
--      every hulog not yet paid in open rounds. Overdue hulog from released rounds stay with
--      the old member.
-- ---------------------------------------------------------------------
create or replace function public.open_replacement(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; c circles;
begin
  select * into m from circle_members where id = p_member;
  if not found or not is_admin(m.circle_id) then raise exception 'Admin only'; end if;
  select * into c from circles where id = m.circle_id for update;
  if c.status <> 'active' then raise exception 'Members can only be replaced while the paluwagan is running'; end if;
  if m.status <> 'approved' then raise exception 'This person is not an active member'; end if;
  if m.role = 'admin' then raise exception 'The admin can’t be replaced'; end if;
  update circles set replacing_member = p_member where id = c.id;
  perform log_activity(c.id, 'replacement_opened', jsonb_build_object('user_id', m.user_id));
end $$;

create or replace function public.cancel_replacement(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  update circles set replacing_member = null where id = p_circle;
  -- Requests sent for the replacement are declined.
  update circle_members set status = 'rejected'
   where circle_id = p_circle and status = 'pending'
     and (select status from circles where id = p_circle) = 'active';
end $$;

create or replace function public.replace_member(p_new uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n circle_members; o circle_members; c circles;
begin
  select * into n from circle_members where id = p_new for update;
  if not found or not is_admin(n.circle_id) then raise exception 'Admin only'; end if;
  select * into c from circles where id = n.circle_id for update;
  if c.replacing_member is null then raise exception 'Choose the member to replace first'; end if;
  if n.status <> 'pending' then raise exception 'Request already handled'; end if;
  select * into o from circle_members where id = c.replacing_member for update;
  if o.status <> 'approved' then raise exception 'That member is no longer active'; end if;

  -- The new member takes the old member's place in the slot.
  update circle_members set status = 'approved', role = 'member', share = o.share,
         slot_group = o.slot_group, slot_no = o.slot_no
   where id = n.id;
  -- Unpaid hulog in open rounds (and the recipient's own share of their payout round) move to the new member.
  update contributions k set member_id = n.id, user_id = n.user_id
    from rounds r
   where r.id = k.round_id and k.member_id = o.id
     and (k.status in ('pending', 'rejected') or k.auto) and r.status <> 'completed';
  update circle_members set status = 'left', slot_group = gen_random_uuid(), slot_no = null where id = o.id;

  update circles set replacing_member = null where id = c.id;
  -- Anyone else who asked to take the slot is declined.
  update circle_members set status = 'rejected' where circle_id = c.id and status = 'pending';
  perform log_activity(c.id, 'member_replaced', jsonb_build_object('old_user', o.user_id, 'new_user', n.user_id));
end $$;

-- Join requests: also accepted while a running paluwagan is looking for a replacement.
create or replace function public.request_join(p_code text, p_hati boolean default false, p_password text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare c circles; mid uuid; h text; fails int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from circles where invite_code = upper(trim(p_code));
  if not found then raise exception 'No circle found with this invite code'; end if;
  if not (c.status = 'forming' or (c.status = 'active' and c.replacing_member is not null)) then
    raise exception 'This circle is no longer accepting members';
  end if;

  select hash into h from circle_passwords where circle_id = c.id;
  if h is not null then
    select count(*) into fails from join_attempts
      where user_id = auth.uid() and circle_id = c.id and at > now() - interval '15 minutes';
    if fails >= 5 then raise exception 'Too many wrong passwords. Try again in 15 minutes.'; end if;
    if p_password is null or crypt(p_password, h) <> h then
      insert into join_attempts (circle_id, user_id) values (c.id, auth.uid());
      return null;
    end if;
  end if;

  insert into circle_members (circle_id, user_id, status, share, agreed_at)
  values (c.id, auth.uid(), 'pending', case when p_hati then 0.5 else 1 end, now())
  on conflict (circle_id, user_id) do update
    set status = 'pending', share = excluded.share, agreed_at = now(),
        slot_group = gen_random_uuid()
    where circle_members.status in ('rejected', 'left')
  returning id into mid;

  if mid is null then raise exception 'You already have a request for this circle'; end if;
  delete from join_attempts where user_id = auth.uid() and circle_id = c.id;
  perform log_activity(c.id, 'member_requested', jsonb_build_object('hati', p_hati));
  return mid;
end $$;

-- Reviewing join requests: declining works any time; approving only while forming
-- (a running paluwagan approves a newcomer through replace_member).
create or replace function public.review_member(p_member uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; c circles; filled numeric;
begin
  select * into m from circle_members where id = p_member for update;
  if not found or not is_admin(m.circle_id) then raise exception 'Admin only'; end if;
  select * into c from circles where id = m.circle_id;
  if m.status <> 'pending' then raise exception 'Request already handled'; end if;

  if p_approve then
    if c.status <> 'forming' then raise exception 'Circle is no longer forming'; end if;
    select coalesce(sum(share), 0) into filled from circle_members
      where circle_id = m.circle_id and status = 'approved';
    if filled + m.share > c.slots then raise exception 'All slots are already filled'; end if;
    update circle_members set status = 'approved' where id = p_member;
  else
    update circle_members set status = 'rejected' where id = p_member;
  end if;
  perform log_activity(m.circle_id, case when p_approve then 'member_approved' else 'member_rejected' end,
                       jsonb_build_object('user_id', m.user_id));
end $$;

revoke all on function public.refresh_my_tiwala() from public, anon;
revoke all on function public.release_round(uuid) from public, anon;
revoke all on function public.cover_contribution(uuid, text) from public, anon;
revoke all on function public.open_replacement(uuid) from public, anon;
revoke all on function public.cancel_replacement(uuid) from public, anon;
revoke all on function public.replace_member(uuid) from public, anon;
grant execute on function public.refresh_my_tiwala() to authenticated;
grant execute on function public.release_round(uuid) to authenticated;
grant execute on function public.cover_contribution(uuid, text) to authenticated;
grant execute on function public.open_replacement(uuid) to authenticated;
grant execute on function public.cancel_replacement(uuid) to authenticated;
grant execute on function public.replace_member(uuid) to authenticated;

-- preview_circle: + replacing, so the join screen knows a running paluwagan is taking a replacement.
drop function if exists public.preview_circle(text);
create or replace function public.preview_circle(p_code text)
returns table (
  id uuid, name text, emoji text, color text, amount numeric, slots int, frequency text,
  start_date date, late_fee numeric, grace_days int, rules text, status text,
  filled numeric, admin_name text, admin_tiwala int, my_status text,
  has_password boolean, interval_days int,
  payout_frequency text, payout_interval_days int, first_payout_date date,
  replacing boolean
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
         c.status = 'active' and c.replacing_member is not null
  from circles c
  join profiles p on p.id = c.created_by
  where c.invite_code = upper(trim(p_code));
$$;
grant execute on function public.preview_circle(text) to authenticated;
