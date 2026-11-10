-- 0023: hand over admin, leave with a refund, fund deductions, and where to pay.
--
-- 1. Hand over admin: the admin offers the role to a member, who accepts or declines.
--    The admin can't leave; they hand over the role first, then leave like any member.
-- 2. Leaving: a member asks the admin first (request_leave). The admin approves and records the
--    refund they agreed on (approve_leave), or declines. A member who doesn't want their hulog
--    back can leave right away (force_leave). In a running paluwagan a member who already got
--    their sahod can't leave, and the slot of one who leaves opens for a replacement (0008 flow).
--    Hulog dated after someone leaves no longer counts against their Trust Score.
-- 3. Fund deductions: the admin records money taken out of what's been collected (with a reason),
--    so the records match. Refunds to leaving members are recorded the same way.
-- 4. Where to pay: optional GCash / Maya / bank details and QR code, shown to members.
--    Leave it empty when the group pays face to face.
--
-- Safe to run on top of 0001–0022.

-- ---------------------------------------------------------------- columns and tables
alter table public.circles
  add column if not exists admin_offer_to uuid,          -- user offered the admin role
  add column if not exists admin_offer_by uuid,
  add column if not exists admin_offer_at timestamptz,
  add column if not exists pay_method text check (pay_method is null or pay_method in ('gcash', 'maya', 'bank', 'other')),
  add column if not exists pay_name   text check (pay_name is null or char_length(pay_name) <= 60),
  add column if not exists pay_number text check (pay_number is null or char_length(pay_number) <= 40),
  add column if not exists pay_note   text check (pay_note is null or char_length(pay_note) <= 200),
  add column if not exists pay_qr_path text;

alter table public.circle_members
  add column if not exists leave_requested_at timestamptz,
  add column if not exists leave_reason text check (leave_reason is null or char_length(leave_reason) <= 200),
  add column if not exists left_at timestamptz;

create table if not exists public.fund_adjustments (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles on delete cascade,
  round_id   uuid references public.rounds on delete set null,
  kind       text not null check (kind in ('deduction', 'refund')),
  amount     numeric(12,2) not null check (amount > 0),
  reason     text not null default '' check (char_length(reason) <= 200),
  user_id    uuid references public.profiles on delete set null,  -- refund: who got it back
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fund_adjustments_circle on public.fund_adjustments (circle_id);
alter table public.fund_adjustments enable row level security;
drop policy if exists "fund_adjustments: members read" on public.fund_adjustments;
create policy "fund_adjustments: members read" on public.fund_adjustments for select to authenticated
  using (public.is_member(circle_id));

-- ---------------------------------------------------------------- 1. hand over admin
create or replace function public.offer_admin(p_circle uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can hand over the role'; end if;
  if p_user = auth.uid() then raise exception 'Pick another member'; end if;
  if not exists (select 1 from circle_members where circle_id = p_circle and user_id = p_user and status = 'approved') then
    raise exception 'Pick a member of this paluwagan';
  end if;
  update circles set admin_offer_to = p_user, admin_offer_by = auth.uid(), admin_offer_at = now() where id = p_circle;
  perform log_activity(p_circle, 'admin_offered', jsonb_build_object('to', p_user));
end $$;

create or replace function public.cancel_admin_offer(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can cancel this'; end if;
  update circles set admin_offer_to = null, admin_offer_by = null, admin_offer_at = null where id = p_circle;
end $$;

create or replace function public.answer_admin_offer(p_circle uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if c.admin_offer_to is distinct from auth.uid() then raise exception 'There is no offer for you to answer'; end if;
  if not exists (select 1 from circle_members where circle_id = p_circle and user_id = auth.uid() and status = 'approved') then
    raise exception 'You are no longer a member of this paluwagan';
  end if;
  update circles set admin_offer_to = null, admin_offer_by = null, admin_offer_at = null where id = p_circle;
  if not p_accept then
    perform log_activity(p_circle, 'admin_offer_declined', jsonb_build_object('from', c.admin_offer_by));
    return;
  end if;
  update circle_members set role = 'member' where circle_id = p_circle and role = 'admin';
  update circle_members set role = 'admin', leave_requested_at = null, leave_reason = null
   where circle_id = p_circle and user_id = auth.uid();
  perform log_activity(p_circle, 'admin_transferred', jsonb_build_object('from', c.admin_offer_by, 'to', auth.uid()));
end $$;

-- ---------------------------------------------------------------- 2. leaving
create or replace function public._check_can_leave(c circles, m circle_members)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if m.status <> 'approved' then raise exception 'You are not an active member'; end if;
  if m.role = 'admin' then raise exception 'Hand over the admin role to another member first, then you can leave'; end if;
  if c.status = 'completed' then raise exception 'This paluwagan has already finished'; end if;
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

create or replace function public._leave_member(p_member uuid, p_refund numeric, p_forced boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; c circles; cur uuid;
begin
  select * into m from circle_members where id = p_member for update;
  select * into c from circles where id = m.circle_id for update;
  perform _check_can_leave(c, m);

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

  if coalesce(p_refund, 0) > 0 then
    select id into cur from rounds where circle_id = c.id and status = 'active';
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by)
    values (c.id, cur, 'refund', p_refund, 'Refund when leaving', m.user_id, auth.uid());
  end if;
  perform log_activity(c.id, 'member_left',
    jsonb_build_object('user_id', m.user_id, 'refund', coalesce(p_refund, 0), 'forced', p_forced, 'open_slot', c.status = 'active'));
  perform recompute_tiwala(m.user_id);
end $$;
revoke execute on function public._leave_member(uuid, numeric, boolean) from public, anon, authenticated;

create or replace function public.request_leave(p_circle uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; c circles;
begin
  select * into c from circles where id = p_circle;
  select * into m from circle_members where circle_id = p_circle and user_id = auth.uid() for update;
  if not found then raise exception 'You are not a member of this paluwagan'; end if;
  perform _check_can_leave(c, m);
  update circle_members set leave_requested_at = now(), leave_reason = nullif(trim(coalesce(p_reason, '')), '') where id = m.id;
  perform log_activity(p_circle, 'leave_requested', jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')));
end $$;

create or replace function public.cancel_leave(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update circle_members set leave_requested_at = null, leave_reason = null where circle_id = p_circle and user_id = auth.uid();
end $$;

create or replace function public.approve_leave(p_member uuid, p_refund numeric)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members;
begin
  select * into m from circle_members where id = p_member;
  if not found or not is_admin(m.circle_id) then raise exception 'Only the admin can approve this'; end if;
  if m.leave_requested_at is null then raise exception 'This member hasn''t asked to leave'; end if;
  if p_refund is null or p_refund < 0 then raise exception 'Enter the refund (0 if none)'; end if;
  perform _leave_member(p_member, p_refund, false);
end $$;

create or replace function public.decline_leave(p_member uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members;
begin
  select * into m from circle_members where id = p_member for update;
  if not found or not is_admin(m.circle_id) then raise exception 'Only the admin can decline this'; end if;
  update circle_members set leave_requested_at = null, leave_reason = null where id = p_member;
  perform log_activity(m.circle_id, 'leave_declined', jsonb_build_object('user_id', m.user_id, 'note', nullif(trim(coalesce(p_note, '')), '')));
end $$;

-- Leave now, without asking for hulog back.
create or replace function public.force_leave(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  select id into mid from circle_members where circle_id = p_circle and user_id = auth.uid();
  if mid is null then raise exception 'You are not a member of this paluwagan'; end if;
  perform _leave_member(mid, 0, true);
end $$;

-- The old leave button (forming only) uses the same rules now.
create or replace function public.leave_circle(p_circle uuid)
returns void language sql security definer set search_path = public as $$
  select force_leave(p_circle);
$$;

-- A slot opened by someone who left can be taken over too.
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
  if o.status not in ('approved', 'left') then raise exception 'That slot is no longer open'; end if;

  update circle_members set status = 'approved', role = 'member', share = o.share,
         slot_group = o.slot_group, slot_no = o.slot_no
   where id = n.id;
  update contributions k set member_id = n.id, user_id = n.user_id
    from rounds r
   where r.id = k.round_id and k.member_id = o.id
     and (k.status in ('pending', 'rejected') or k.auto) and r.status <> 'completed';
  update circle_members set status = 'left', left_at = coalesce(o.left_at, now()), slot_group = gen_random_uuid(), slot_no = null where id = o.id;

  update circles set replacing_member = null where id = c.id;
  update circle_members set status = 'rejected' where circle_id = c.id and status = 'pending';
  perform log_activity(c.id, 'member_replaced', jsonb_build_object('old_user', o.user_id, 'new_user', n.user_id));
end $$;

-- Trust Score (0008) minus hulog dated after the member left.
create or replace function public.recompute_tiwala(u uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total int; good int;
begin
  select count(*), count(*) filter (where k.status = 'confirmed' and k.on_time and k.covered_by is null)
    into total, good
    from contributions k
    join rounds r on r.id = k.round_id
    join circles c on c.id = k.circle_id
    join circle_members m on m.id = k.member_id
   where k.user_id = u and not k.auto and c.deleted_at is null
     and ((k.status = 'confirmed' and k.on_time is not null)
          or (k.status in ('pending', 'rejected')
              and coalesce(k.due_date, r.due_date) + c.grace_days < (now() at time zone 'Asia/Manila')::date
              and (m.left_at is null or coalesce(k.due_date, r.due_date) < (m.left_at at time zone 'Asia/Manila')::date)));
  update profiles set tiwala_score = round(100.0 * (good + 4) / (total + 5)) where id = u;
end $$;
revoke execute on function public.recompute_tiwala(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. fund deductions
create or replace function public.add_deduction(p_circle uuid, p_amount numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare cur uuid;
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can record a deduction'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter how much was taken out'; end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Say what the money was used for'; end if;
  select id into cur from rounds where circle_id = p_circle and status = 'active';
  insert into fund_adjustments (circle_id, round_id, kind, amount, reason, created_by)
  values (p_circle, cur, 'deduction', p_amount, left(trim(p_reason), 200), auth.uid());
  perform log_activity(p_circle, 'fund_deducted', jsonb_build_object('amount', p_amount, 'reason', left(trim(p_reason), 200)));
end $$;

create or replace function public.remove_deduction(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a fund_adjustments;
begin
  select * into a from fund_adjustments where id = p_id;
  if not found or not is_admin(a.circle_id) then raise exception 'Only the admin can remove this'; end if;
  if a.kind <> 'deduction' then raise exception 'Refunds can''t be removed'; end if;
  delete from fund_adjustments where id = p_id;
  perform log_activity(a.circle_id, 'fund_deduction_removed', jsonb_build_object('amount', a.amount, 'reason', a.reason));
end $$;

-- ---------------------------------------------------------------- 4. where to pay
create or replace function public.set_pay_info(p_circle uuid, p_method text, p_name text, p_number text, p_note text, p_qr_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can change the payment details'; end if;
  if p_qr_path is not null and split_part(p_qr_path, '/', 1) <> p_circle::text then raise exception 'Invalid QR image'; end if;
  update circles set
    pay_method  = p_method,
    pay_name    = case when p_method is null then null else nullif(trim(coalesce(p_name, '')), '') end,
    pay_number  = case when p_method is null then null else nullif(trim(coalesce(p_number, '')), '') end,
    pay_note    = nullif(trim(coalesce(p_note, '')), ''),
    pay_qr_path = case when p_method is null then null else p_qr_path end
  where id = p_circle;
end $$;

-- QR codes: private bucket at {circle_id}/{file}; members can view, the admin uploads.
insert into storage.buckets (id, name, public) values ('pay-qr', 'pay-qr', false) on conflict (id) do nothing;
drop policy if exists "pay-qr: members read" on storage.objects;
create policy "pay-qr: members read" on storage.objects for select to authenticated
  using (bucket_id = 'pay-qr' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "pay-qr: admin upload" on storage.objects;
create policy "pay-qr: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'pay-qr' and public.is_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists "pay-qr: admin delete" on storage.objects;
create policy "pay-qr: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pay-qr' and public.is_admin(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'offer_admin(uuid, uuid)', 'cancel_admin_offer(uuid)', 'answer_admin_offer(uuid, boolean)',
    'request_leave(uuid, text)', 'cancel_leave(uuid)', 'approve_leave(uuid, numeric)', 'decline_leave(uuid, text)',
    'force_leave(uuid)', 'add_deduction(uuid, numeric, text)', 'remove_deduction(uuid)',
    'set_pay_info(uuid, text, text, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
