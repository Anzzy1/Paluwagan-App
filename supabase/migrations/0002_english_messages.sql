-- 0002: English error messages for user-facing RPC errors.
-- Safe to run on top of 0001 (CREATE OR REPLACE only).

create or replace function public.request_join(p_code text, p_hati boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare c circles; mid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from circles where invite_code = upper(trim(p_code));
  if not found then raise exception 'No circle found with this invite code'; end if;
  if c.status <> 'forming' then raise exception 'This circle is no longer accepting members'; end if;

  insert into circle_members (circle_id, user_id, status, share, agreed_at)
  values (c.id, auth.uid(), 'pending', case when p_hati then 0.5 else 1 end, now())
  on conflict (circle_id, user_id) do update
    set status = 'pending', share = excluded.share, agreed_at = now(),
        slot_group = gen_random_uuid()
    where circle_members.status in ('rejected', 'left')
  returning id into mid;

  if mid is null then raise exception 'You already have a request for this circle'; end if;
  perform log_activity(c.id, 'member_requested', jsonb_build_object('hati', p_hati));
  return mid;
end $$;

create or replace function public.review_member(p_member uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; c circles; filled numeric;
begin
  select * into m from circle_members where id = p_member for update;
  if not found or not is_admin(m.circle_id) then raise exception 'Admin only'; end if;
  select * into c from circles where id = m.circle_id;
  if c.status <> 'forming' then raise exception 'Circle is no longer forming'; end if;
  if m.status <> 'pending' then raise exception 'Request already handled'; end if;

  if p_approve then
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

create or replace function public.leave_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members;
begin
  select * into m from circle_members where circle_id = p_circle and user_id = auth.uid();
  if not found then raise exception 'Not a member'; end if;
  if m.role = 'admin' then raise exception 'Admin cannot leave'; end if;
  if (select status from circles where id = p_circle) <> 'forming' then
    raise exception 'You can no longer leave: the circle has already started';
  end if;
  update circle_members set status = 'left', slot_group = gen_random_uuid() where id = m.id;
  -- un-pair partner, if any
  update circle_members set slot_group = gen_random_uuid()
    where circle_id = p_circle and slot_group = m.slot_group and id <> m.id;
  perform log_activity(p_circle, 'member_left');
end $$;

create or replace function public._slot_groups(p_circle uuid) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare c circles; groups uuid[]; bad int;
begin
  select * into c from circles where id = p_circle;
  select array_agg(distinct slot_group) into groups
    from circle_members where circle_id = p_circle and status = 'approved';
  select count(*) into bad from (
    select slot_group from circle_members
    where circle_id = p_circle and status = 'approved'
    group by slot_group having sum(share) <> 1
  ) x;
  if bad > 0 then raise exception 'A split-slot member has not been paired yet'; end if;
  if coalesce(array_length(groups, 1), 0) <> c.slots then
    raise exception 'This circle needs % slots; only % are filled', c.slots, coalesce(array_length(groups, 1), 0);
  end if;
  return groups;
end $$;

create or replace function public.request_swap(p_circle uuid, p_to_member uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me circle_members; them circle_members; sid uuid;
begin
  select * into me from circle_members where circle_id = p_circle and user_id = auth.uid() and status = 'approved';
  select * into them from circle_members where id = p_to_member and circle_id = p_circle and status = 'approved';
  if me.id is null or them.id is null then raise exception 'Invalid members'; end if;
  if me.slot_group = them.slot_group then raise exception 'Same slot'; end if;
  if exists (select 1 from rounds where circle_id = p_circle
             and slot_group in (me.slot_group, them.slot_group) and status <> 'upcoming') then
    raise exception 'Only upcoming payout rounds can be swapped';
  end if;
  if exists (select 1 from swap_requests where circle_id = p_circle and status in ('pending','accepted')
             and (from_member in (me.id, them.id) or to_member in (me.id, them.id))) then
    raise exception 'There is already an open swap request for one of these slots';
  end if;
  insert into swap_requests (circle_id, from_member, to_member) values (p_circle, me.id, them.id)
    returning id into sid;
  perform log_activity(p_circle, 'swap_requested', jsonb_build_object('to', them.user_id));
  return sid;
end $$;

revoke execute on function public._slot_groups(uuid) from public, anon, authenticated;
