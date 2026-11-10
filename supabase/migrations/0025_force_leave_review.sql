-- 0025: everyone leaving deletes the paluwagan, and the admin reviews a force leave.
--
-- 1. The admin still can't leave while other members are in, but once they're the last one,
--    leaving deletes the paluwagan (soft delete, like delete_circle: it stays in their Deleted
--    history, where they can restore or remove it).
-- 2. When someone leaves without a refund (force leave), the admin gets a to-do: what they paid in
--    is split among the members by default (0024); the admin keeps it, or changes the amount
--    split (e.g. they agreed in the chat to give some of it back). review_left saves the choice.
--    Approved leaves are already reviewed (the admin set the refund when approving).
--
-- Safe to run on top of 0001–0024.

alter table public.circle_members
  add column if not exists left_forced boolean not null default false,
  add column if not exists left_reviewed_at timestamptz;

-- ---------------------------------------------------------------- 1. the last one out
create or replace function public._check_can_leave(c circles, m circle_members)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if m.status <> 'approved' then raise exception 'You are not an active member'; end if;
  if c.status = 'completed' then raise exception 'This paluwagan has already finished'; end if;
  if m.role = 'admin' then
    if exists (select 1 from circle_members where circle_id = c.id and status = 'approved' and id <> m.id) then
      raise exception 'Hand over the admin role to another member first, then you can leave';
    end if;
    return;  -- the last member: leaving deletes the paluwagan
  end if;
  if c.status = 'locked' then raise exception 'The draw is about to happen. Ask the admin to unlock it first.'; end if;
  if c.status = 'active' then
    if exists (select 1 from rounds where circle_id = c.id and slot_group = m.slot_group and status = 'completed') then
      raise exception 'You already received your sahod, so you need to finish your hulog. Talk to the admin about a replacement.';
    end if;
    if c.replacing_member is not null and c.replacing_member <> m.id then
      raise exception 'Another slot is waiting for a replacement. Try again once it''s filled.';
    end if;
  end if;
end $$;
revoke execute on function public._check_can_leave(circles, circle_members) from public, anon, authenticated;

-- Same as 0024, plus: the last member leaving deletes the paluwagan, and force leaves wait for
-- the admin's review.
create or replace function public._leave_member(p_member uuid, p_refund numeric, p_forced boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  m circle_members; c circles; cur uuid;
  paid numeric; refund numeric := greatest(coalesce(p_refund, 0), 0); rest numeric; n int;
begin
  select * into m from circle_members where id = p_member for update;
  select * into c from circles where id = m.circle_id for update;
  perform _check_can_leave(c, m);

  if m.role = 'admin' then
    -- Nobody else is left. They stay the admin of the deleted paluwagan so it shows in their history.
    update circles set deleted_at = now(), admin_offer_to = null, admin_offer_by = null, admin_offer_at = null where id = c.id;
    perform log_activity(c.id, 'circle_deleted', jsonb_build_object('everyone_left', true));
    return;
  end if;

  -- What they paid in themselves (not covered by the admin, not the recipient's own share).
  select coalesce(sum(amount), 0) into paid
    from contributions where member_id = m.id and status = 'confirmed' and covered_by is null and not auto;

  if c.status = 'active' then
    -- Keep the slot (and its unpaid hulog) for whoever replaces them.
    update circle_members set status = 'left', left_at = now(), leave_requested_at = null, leave_reason = null,
           left_forced = p_forced, left_reviewed_at = case when p_forced then null else now() end
     where id = m.id;
    update circles set replacing_member = m.id where id = c.id;
  else
    update circle_members set status = 'left', left_at = now(), leave_requested_at = null, leave_reason = null,
           left_forced = p_forced, left_reviewed_at = case when p_forced then null else now() end,
           slot_group = gen_random_uuid(), slot_no = null
     where id = m.id;
    update circle_members set slot_group = gen_random_uuid()
     where circle_id = c.id and slot_group = m.slot_group and id <> m.id;
  end if;
  -- An admin offer to someone who left is void.
  update circles set admin_offer_to = null, admin_offer_by = null, admin_offer_at = null
   where id = c.id and admin_offer_to = m.user_id;

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

-- ---------------------------------------------------------------- 2. the admin reviews a force leave
-- p_split: how much of what they paid in is split among the members (default: all of it).
-- 0 = nothing split (e.g. the admin gives it all back to them in person).
create or replace function public.review_left(p_member uuid, p_split numeric)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; a fund_adjustments; paid numeric; n int; cur uuid;
begin
  select * into m from circle_members where id = p_member for update;
  if not found or not is_admin(m.circle_id) then raise exception 'Only the admin can do this'; end if;
  if m.status <> 'left' or not m.left_forced or m.left_reviewed_at is not null then
    raise exception 'Nothing to review for this member';
  end if;
  if p_split is null or p_split < 0 then raise exception 'Enter the amount to split (0 if none)'; end if;
  select coalesce(sum(amount), 0) into paid
    from contributions where member_id = m.id and status = 'confirmed' and covered_by is null and not auto;
  if p_split > paid then raise exception 'They only paid in ₱%', paid; end if;

  select * into a from fund_adjustments
   where circle_id = m.circle_id and kind = 'split' and user_id = m.user_id and created_at >= m.left_at
   order by created_at desc limit 1;

  if p_split = 0 then
    if a.id is not null then delete from fund_adjustments where id = a.id; end if;
  elsif a.id is not null then
    update fund_adjustments set amount = p_split where id = a.id;
  else
    select count(*) into n from circle_members where circle_id = m.circle_id and status = 'approved';
    select id into cur from rounds where circle_id = m.circle_id and status = 'active';
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by, split_count)
    values (m.circle_id, cur, 'split', p_split, 'Left behind when leaving, split among the members', m.user_id, auth.uid(), greatest(n, 1));
  end if;

  update circle_members set left_reviewed_at = now() where id = m.id;
  perform log_activity(m.circle_id, 'leave_reviewed',
    jsonb_build_object('user_id', m.user_id, 'paid', paid, 'split', p_split, 'before', coalesce(a.amount, 0),
                       'split_count', coalesce(a.split_count, (select count(*) from circle_members where circle_id = m.circle_id and status = 'approved'))));
end $$;

revoke all on function public.review_left(uuid, numeric) from public, anon;
grant execute on function public.review_left(uuid, numeric) to authenticated;
