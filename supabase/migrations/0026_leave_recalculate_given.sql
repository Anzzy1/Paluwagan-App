-- 0026: leaving recalculates the paluwagan (no replacement needed), and money handed out is
-- marked as given.
--
-- 1. When a member leaves a running paluwagan, their money is settled (refund / split, 0024–0025)
--    and the rest carry on without them:
--    * their hulog not paid yet are dropped, so every sahod after this is smaller;
--    * a whole slot: everyone after them in the order gets their sahod one turn earlier, and the
--      last turn is dropped (the paluwagan ends one turn sooner, slots - 1);
--    * a shared (hati) slot: the partner takes the whole slot and pays the full hulog from now on.
--    Hulog someone already paid for the dropped last turn are moved to the new last turn and
--    recorded as a refund to them.
--    Nobody has to replace them.
-- 2. Refunds and splits list who gets how much (fund_gives). The admin marks each one as given,
--    so every member sees what's been handed over.
--
-- Safe to run on top of 0001–0025.

-- ---------------------------------------------------------------- who gets what, and given or not
create table if not exists public.fund_gives (
  id            uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.fund_adjustments on delete cascade,
  circle_id     uuid not null references public.circles on delete cascade,
  user_id       uuid references public.profiles on delete set null,
  amount        numeric(12,2) not null check (amount > 0),
  given_at      timestamptz,
  given_by      uuid references public.profiles on delete set null
);
create index if not exists fund_gives_circle on public.fund_gives (circle_id);
alter table public.fund_gives enable row level security;
drop policy if exists "fund_gives: members read" on public.fund_gives;
create policy "fund_gives: members read" on public.fund_gives for select to authenticated
  using (public.is_member(circle_id));

-- Equal shares of a split among the members still in; the leftover centavo(s) go to the first.
-- Recreating resets "given" (only used right when the split is made or changed).
create or replace function public._split_gives(p_adj uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a fund_adjustments; n int; base numeric; extra numeric;
begin
  select * into a from fund_adjustments where id = p_adj;
  delete from fund_gives where adjustment_id = p_adj;
  select count(*) into n from circle_members where circle_id = a.circle_id and status = 'approved';
  if n = 0 then return; end if;
  base := trunc(a.amount / n, 2);
  extra := a.amount - base * n;
  insert into fund_gives (adjustment_id, circle_id, user_id, amount)
  select p_adj, a.circle_id, x.user_id, x.amt from (
    select m.user_id, base + case when row_number() over (order by m.joined_at, m.id) = 1 then extra else 0 end as amt
      from circle_members m where m.circle_id = a.circle_id and m.status = 'approved'
  ) x where x.amt > 0;
  update fund_adjustments set split_count = n where id = p_adj;
end $$;
revoke execute on function public._split_gives(uuid) from public, anon, authenticated;

-- Refunds and splits made before this migration.
insert into public.fund_gives (adjustment_id, circle_id, user_id, amount)
select a.id, a.circle_id, a.user_id, a.amount from public.fund_adjustments a
 where a.kind = 'refund' and not exists (select 1 from public.fund_gives g where g.adjustment_id = a.id);
do $$
declare x uuid;
begin
  for x in select a.id from public.fund_adjustments a
            where a.kind = 'split' and not exists (select 1 from public.fund_gives g where g.adjustment_id = a.id) loop
    perform public._split_gives(x);
  end loop;
end $$;

create or replace function public.mark_given(p_give uuid, p_given boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g fund_gives; k text;
begin
  select * into g from fund_gives where id = p_give for update;
  if not found or not is_admin(g.circle_id) then raise exception 'Only the admin can do this'; end if;
  if (g.given_at is not null) = p_given then return; end if;
  update fund_gives set given_at = case when p_given then now() end, given_by = case when p_given then auth.uid() end where id = p_give;
  select kind into k from fund_adjustments where id = g.adjustment_id;
  perform log_activity(g.circle_id, case when p_given then 'fund_given' else 'fund_given_undone' end,
    jsonb_build_object('user_id', g.user_id, 'amount', g.amount, 'kind', k));
end $$;

-- ---------------------------------------------------------------- 1. leaving recalculates
create or replace function public._check_can_leave(c circles, m circle_members)
returns void language plpgsql stable security definer set search_path = public as $$
declare r rounds;
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
    select * into r from rounds where circle_id = c.id and slot_group = m.slot_group;
    if r.status = 'completed' then
      raise exception 'You already received your sahod, so you need to finish your hulog.';
    end if;
    if r.status = 'active'
       and not exists (select 1 from rounds where circle_id = c.id and round_no > r.round_no)
       and not exists (select 1 from circle_members where circle_id = c.id and slot_group = m.slot_group and status = 'approved' and id <> m.id) then
      raise exception 'Everyone else already got their sahod, and yours is the last one. Ask the admin to release it to you.';
    end if;
  end if;
end $$;
revoke execute on function public._check_can_leave(circles, circle_members) from public, anon, authenticated;

create or replace function public._leave_member(p_member uuid, p_refund numeric, p_forced boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  m circle_members; c circles; cur uuid; adj uuid;
  rk rounds; lr rounds; prev uuid; groups uuid[]; j int; pk contributions;
  paid numeric; refund numeric := greatest(coalesce(p_refund, 0), 0); rest numeric; n int;
  partners int := 0; dropped boolean := false;
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

  -- What they paid in themselves (not covered by the admin).
  select coalesce(sum(amount), 0) into paid
    from contributions where member_id = m.id and status = 'confirmed' and covered_by is null and not auto;

  update circle_members set status = 'left', left_at = now(), leave_requested_at = null, leave_reason = null,
         left_forced = p_forced, left_reviewed_at = case when p_forced then null else now() end,
         slot_group = gen_random_uuid(), slot_no = null
   where id = m.id;
  update circles set replacing_member = null where id = c.id and replacing_member = m.id;
  update circles set admin_offer_to = null, admin_offer_by = null, admin_offer_at = null
   where id = c.id and admin_offer_to = m.user_id;
  update swap_requests set status = 'cancelled'
   where circle_id = c.id and status in ('pending', 'accepted') and (from_member = m.id or to_member = m.id);

  if c.status = 'active' then
    -- Their hulog not paid yet are dropped: every sahod from here on is smaller.
    delete from contributions k using rounds r
     where r.id = k.round_id and k.member_id = m.id and k.status in ('pending', 'rejected') and r.status <> 'completed';

    select count(*) into partners from circle_members
     where circle_id = c.id and slot_group = m.slot_group and status = 'approved';

    if partners > 0 then
      -- Shared slot: the partner takes the whole slot and pays the full hulog from now on.
      update contributions k set amount = round(k.amount / cm.share * least(cm.share + m.share, 1), 2)
        from rounds r, circle_members cm
       where r.id = k.round_id and cm.id = k.member_id and cm.circle_id = c.id and cm.slot_group = m.slot_group
         and cm.status = 'approved' and k.status in ('pending', 'rejected') and r.status <> 'completed';
      update circle_members set share = least(share + m.share, 1)
       where circle_id = c.id and slot_group = m.slot_group and status = 'approved';
    else
      -- Whole slot: everyone after them moves up one turn and the last turn is dropped.
      select * into rk from rounds where circle_id = c.id and slot_group = m.slot_group;
      select * into lr from rounds where circle_id = c.id order by round_no desc limit 1;
      select id into prev from rounds
       where circle_id = c.id and round_no < lr.round_no and status <> 'completed'
       order by round_no desc limit 1;

      -- Hulog already paid for the dropped last turn move to the new last turn; others get it back.
      for pk in select * from contributions where round_id = lr.id and status in ('submitted', 'confirmed') loop
        update contributions set round_id = prev where id = pk.id;
        if pk.status = 'confirmed' and pk.member_id <> m.id and pk.covered_by is null then
          insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by)
          values (c.id, prev, 'refund', pk.amount, 'Paid early for a turn that was dropped', pk.user_id, auth.uid())
          returning id into adj;
          insert into fund_gives (adjustment_id, circle_id, user_id, amount) values (adj, c.id, pk.user_id, pk.amount);
        end if;
      end loop;
      delete from contributions where round_id = lr.id;

      groups := array(select slot_group from rounds where circle_id = c.id and round_no >= rk.round_no order by round_no);
      delete from rounds where id = lr.id;
      -- From the end backwards so a turn is free before it's handed down.
      for j in reverse (lr.round_no - 1) .. rk.round_no loop
        update rounds set slot_group = groups[j - rk.round_no + 2] where circle_id = c.id and round_no = j;
        update circle_members set slot_no = j where circle_id = c.id and slot_group = groups[j - rk.round_no + 2];
      end loop;
      update circles set slots = greatest(slots - 1, 2) where id = c.id;
      dropped := true;
    end if;
  else
    -- Not started yet: their slot simply goes away.
    update circle_members set slot_group = gen_random_uuid()
     where circle_id = c.id and slot_group = m.slot_group and status <> 'left';
  end if;

  select id into cur from rounds where circle_id = c.id and status = 'active';
  if refund > 0 then
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by)
    values (c.id, cur, 'refund', refund, 'Refund when leaving', m.user_id, auth.uid())
    returning id into adj;
    insert into fund_gives (adjustment_id, circle_id, user_id, amount) values (adj, c.id, m.user_id, refund);
  end if;

  rest := paid - refund;
  select count(*) into n from circle_members where circle_id = c.id and status = 'approved';
  if rest > 0 and n > 0 then
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by, split_count)
    values (c.id, cur, 'split', rest, 'Left behind when leaving, split among the members', m.user_id, auth.uid(), n)
    returning id into adj;
    perform _split_gives(adj);
  else
    rest := 0;
  end if;

  perform log_activity(c.id, 'member_left',
    jsonb_build_object('user_id', m.user_id, 'refund', refund, 'forced', p_forced,
                       'recalculated', c.status = 'active', 'dropped_turn', dropped, 'took_whole_slot', partners > 0,
                       'paid', paid, 'split', rest, 'split_count', n, 'each', case when n > 0 then round(rest / n, 2) else 0 end));
  perform recompute_tiwala(m.user_id);
end $$;
revoke execute on function public._leave_member(uuid, numeric, boolean) from public, anon, authenticated;

-- Same as 0025, plus the members' shares are recalculated.
create or replace function public.review_left(p_member uuid, p_split numeric)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; a fund_adjustments; paid numeric; cur uuid; adj uuid;
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
    if p_split <> a.amount then
      update fund_adjustments set amount = p_split where id = a.id;
      perform _split_gives(a.id);
    end if;
  else
    select id into cur from rounds where circle_id = m.circle_id and status = 'active';
    insert into fund_adjustments (circle_id, round_id, kind, amount, reason, user_id, created_by, split_count)
    values (m.circle_id, cur, 'split', p_split, 'Left behind when leaving, split among the members', m.user_id, auth.uid(), 1)
    returning id into adj;
    perform _split_gives(adj);
  end if;

  update circle_members set left_reviewed_at = now() where id = m.id;
  perform log_activity(m.circle_id, 'leave_reviewed',
    jsonb_build_object('user_id', m.user_id, 'paid', paid, 'split', p_split, 'before', coalesce(a.amount, 0),
                       'split_count', (select count(*) from circle_members where circle_id = m.circle_id and status = 'approved')));
end $$;

revoke all on function public.mark_given(uuid, boolean) from public, anon;
grant execute on function public.mark_given(uuid, boolean) to authenticated;
