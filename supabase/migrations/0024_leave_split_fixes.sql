-- 0024: fixes on top of 0023.
--
-- 1. A slot opened because its member left can't be abandoned: "stop looking for a replacement"
--    is refused for it, and its sahod can't be released while nobody holds the slot.
-- 2. Leaving and the fund: whatever the leaving member paid in and doesn't take back is split
--    equally among the members who stay ('split' adjustment, taken out of the current fund like
--    a refund). Force leave = nothing taken back, so all of it is split. Approved leave = the
--    agreed refund goes to them, the rest (if any) is split.
-- 3. preview_circle shows the current admin (after a hand-over), not whoever created it.
-- 4. Deductions only while the paluwagan is running (they belong to the current round).
--
-- Safe to run on top of 0001–0023.

-- ---------------------------------------------------------------- 2. split adjustments
alter table public.fund_adjustments drop constraint if exists fund_adjustments_kind_check;
alter table public.fund_adjustments add constraint fund_adjustments_kind_check
  check (kind in ('deduction', 'refund', 'split'));
alter table public.fund_adjustments add column if not exists split_count int check (split_count is null or split_count > 0);

create or replace function public._leave_member(p_member uuid, p_refund numeric, p_forced boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  m circle_members; c circles; cur uuid;
  paid numeric; refund numeric := greatest(coalesce(p_refund, 0), 0); rest numeric; n int;
begin
  select * into m from circle_members where id = p_member for update;
  select * into c from circles where id = m.circle_id for update;
  perform _check_can_leave(c, m);

  -- What they paid in themselves (not covered by the admin, not the recipient's own share).
  select coalesce(sum(amount), 0) into paid
    from contributions where member_id = m.id and status = 'confirmed' and covered_by is null and not auto;

  if c.status = 'active' then
    -- Keep the slot (and its unpaid hulog) for whoever replaces them.
    update circle_members set status = 'left', left_at = now(), leave_requested_at = null, leave_reason = null where id = m.id;
    update circles set replacing_member = m.id where id = c.id;
  else
    update circle_members set status = 'left', left_at = now(), leave_requested_at = null, leave_reason = null,
           slot_group = gen_random_uuid(), slot_no = null where id = m.id;
    update circle_members set slot_group = gen_random_uuid()
     where circle_id = c.id and slot_group = m.slot_group and id <> m.id;
  end if;

  select id into cur from rounds where circle_id = c.id and status = 'active';
  if refund > 0 then
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by)
    values (c.id, cur, 'refund', refund, 'Refund when leaving', m.user_id, auth.uid());
  end if;

  rest := paid - refund;
  select count(*) into n from circle_members where circle_id = c.id and status = 'approved';
  if rest > 0 and n > 0 then
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by, split_count)
    values (c.id, cur, 'split', rest, 'Left behind when leaving, split among the members', m.user_id, auth.uid(), n);
  else
    rest := 0;
  end if;

  perform log_activity(c.id, 'member_left',
    jsonb_build_object('user_id', m.user_id, 'refund', refund, 'forced', p_forced, 'open_slot', c.status = 'active',
                       'paid', paid, 'split', rest, 'split_count', n, 'each', case when n > 0 then round(rest / n, 2) else 0 end));
  perform recompute_tiwala(m.user_id);
end $$;
revoke execute on function public._leave_member(uuid, numeric, boolean) from public, anon, authenticated;

-- Splits are calculated, not typed in, so only deductions can be removed (unchanged), and
-- refunds and splits stay.

-- ---------------------------------------------------------------- 1. abandoned slots
create or replace function public.cancel_replacement(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o circle_members;
begin
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  select m.* into o from circle_members m join circles c on c.replacing_member = m.id where c.id = p_circle;
  if found and o.status = 'left' then
    raise exception 'This member already left, so someone has to take over their slot. Share the invite code to find a replacement.';
  end if;
  update circles set replacing_member = null where id = p_circle;
  -- Requests sent for the replacement are declined.
  update circle_members set status = 'rejected'
   where circle_id = p_circle and status = 'pending'
     and (select status from circles where id = p_circle) = 'active';
end $$;

-- Same as 0021, plus: refuse when nobody holds the slot that gets this sahod.
create or replace function public._release_sahod(p_circle uuid, p_early boolean, p_extra jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c circles; r rounds; unpaid_n int; unpaid_amt numeric; paid_amt numeric; u uuid;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can release the sahod'; end if;
  if c.status <> 'active' then raise exception 'This paluwagan is not running'; end if;
  if c.paused_at is not null then raise exception 'Resume the paluwagan first'; end if;
  if c.revealed_at is null then raise exception 'Finish the draw first'; end if;
  select * into r from rounds where circle_id = p_circle and status = 'active' for update;
  if not found then raise exception 'There is no current round'; end if;
  if not exists (select 1 from circle_members where circle_id = p_circle and slot_group = r.slot_group and status = 'approved') then
    raise exception 'This sahod belongs to a member who left. Replace them first, then release it to the new member.';
  end if;

  select count(*) filter (where status <> 'confirmed'),
         coalesce(sum(amount) filter (where status <> 'confirmed'), 0),
         coalesce(sum(amount) filter (where status = 'confirmed'), 0)
    into unpaid_n, unpaid_amt, paid_amt
    from contributions where round_id = r.id;

  if not p_early and r.due_date > (now() at time zone 'Asia/Manila')::date and unpaid_n > 0 then
    raise exception 'The sahod date hasn’t arrived yet. You can release early once everyone has paid, or use Advance sahod.';
  end if;

  update rounds set status = 'completed', completed_at = now() where id = r.id;
  perform log_activity(p_circle, case when p_early and r.due_date > (now() at time zone 'Asia/Manila')::date then 'sahod_advanced' else 'round_released' end,
    jsonb_build_object('round_no', r.round_no, 'unpaid', unpaid_n, 'unpaid_amount', unpaid_amt, 'paid_amount', paid_amt,
                       'due', r.due_date,
                       'recipients', (select jsonb_agg(user_id) from circle_members
                                       where circle_id = p_circle and slot_group = r.slot_group and status = 'approved'))
    || coalesce(p_extra, '{}'::jsonb));
  perform _activate_next(p_circle);

  for u in select distinct user_id from contributions where round_id = r.id and status <> 'confirmed' loop
    perform recompute_tiwala(u);
  end loop;
end $$;
revoke execute on function public._release_sahod(uuid, boolean, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. current admin on the join screen
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
         coalesce(a.full_name, p.full_name), coalesce(a.tiwala_score, p.tiwala_score),
         (select m.status from circle_members m where m.circle_id = c.id and m.user_id = auth.uid()),
         c.has_password, c.interval_days,
         c.payout_frequency, c.payout_interval_days, c.first_payout_date,
         c.status = 'active' and c.replacing_member is not null,
         (select count(*)::int from circle_members m where m.circle_id = c.id and m.status = 'approved')
  from circles c
  join profiles p on p.id = c.created_by
  left join lateral (
    select ap.full_name, ap.tiwala_score
      from circle_members am join profiles ap on ap.id = am.user_id
     where am.circle_id = c.id and am.role = 'admin' and am.status = 'approved'
     limit 1
  ) a on true
  where c.invite_code = upper(trim(p_code));
$$;
grant execute on function public.preview_circle(text) to authenticated;

-- ---------------------------------------------------------------- 4. deductions only while running
create or replace function public.add_deduction(p_circle uuid, p_amount numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare cur uuid;
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can record a deduction'; end if;
  if (select status from circles where id = p_circle) <> 'active' then
    raise exception 'Deductions can only be recorded while the paluwagan is running';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter how much was taken out'; end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Say what the money was used for'; end if;
  select id into cur from rounds where circle_id = p_circle and status = 'active';
  if cur is null then raise exception 'There is no current round'; end if;
  insert into fund_adjustments (circle_id, round_id, kind, amount, reason, created_by)
  values (p_circle, cur, 'deduction', p_amount, left(trim(p_reason), 200), auth.uid());
  perform log_activity(p_circle, 'fund_deducted', jsonb_build_object('amount', p_amount, 'reason', left(trim(p_reason), 200)));
end $$;

-- ---------------------------------------------------------------- 5. joining again after leaving
-- Same as 0008, plus:
--  * someone whose slot is waiting for a replacement can't send a join request: it would reuse their
--    own (left) row and wipe the slot that the replacement is meant to take over;
--  * left_at is cleared when a former member joins again, so their new hulog count toward their
--    Trust Score (0023 skips hulog dated after left_at).
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
  if c.status = 'active' and exists (select 1 from circle_members where id = c.replacing_member and user_id = auth.uid()) then
    raise exception 'You left this paluwagan, and your slot is waiting for someone new. Talk to the admin.';
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
        slot_group = gen_random_uuid(), left_at = null, leave_requested_at = null, leave_reason = null
    where circle_members.status in ('rejected', 'left')
  returning id into mid;

  if mid is null then raise exception 'You already have a request for this circle'; end if;
  delete from join_attempts where user_id = auth.uid() and circle_id = c.id;
  perform log_activity(c.id, 'member_requested', jsonb_build_object('hati', p_hati));
  return mid;
end $$;
