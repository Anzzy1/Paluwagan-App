-- 0010: no fixed number of slots.
--
-- A new paluwagan no longer asks how many slots it has. Members keep joining with the
-- invite code (up to 50), and circles.slots follows the number of approved slots while the
-- paluwagan is forming. The admin can lock it once at least 3 slots are filled; the
-- number is fixed from then on.
--
-- Safe to run on top of 0001–0009.

-- An admin alone is 1 slot while forming.
alter table public.circles drop constraint if exists circles_slots_check;
alter table public.circles add constraint circles_slots_check check (slots between 1 and 50);

-- Approved slots: split-slot halves count as one slot (paired or not, rounded up).
create or replace function public._filled_slots(p_circle uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(ceil(sum(share)), 0)::int from circle_members
   where circle_id = p_circle and status = 'approved';
$$;
revoke execute on function public._filled_slots(uuid) from public, anon, authenticated;

-- Keep circles.slots equal to the members who've joined, while forming.
create or replace function public._sync_forming_slots()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.circle_id, old.circle_id);
begin
  update circles set slots = greatest(1, least(50, _filled_slots(cid)))
   where id = cid and status = 'forming';
  return null;
end $$;
revoke execute on function public._sync_forming_slots() from public, anon, authenticated;

drop trigger if exists sync_forming_slots on public.circle_members;
create trigger sync_forming_slots after insert or update of status, share or delete on public.circle_members
  for each row execute function public._sync_forming_slots();

-- Unlocking reopens the paluwagan: recount.
create or replace function public._sync_slots_on_reopen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'forming' and old.status <> 'forming' then
    new.slots := greatest(1, least(50, _filled_slots(new.id)));
  end if;
  return new;
end $$;
revoke execute on function public._sync_slots_on_reopen() from public, anon, authenticated;

drop trigger if exists sync_slots_on_reopen on public.circles;
create trigger sync_slots_on_reopen before update of status on public.circles
  for each row execute function public._sync_slots_on_reopen();

-- Existing forming paluwagan: match what has joined so far.
update public.circles c set slots = greatest(1, least(50, public._filled_slots(c.id)))
 where c.status = 'forming';

-- Approving: up to 50 slots.
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
    if filled + m.share > 50 then raise exception 'A paluwagan can have at most 50 slots'; end if;
    update circle_members set status = 'approved' where id = p_member;
  else
    update circle_members set status = 'rejected' where id = p_member;
  end if;
  perform log_activity(m.circle_id, case when p_approve then 'member_approved' else 'member_rejected' end,
                       jsonb_build_object('user_id', m.user_id));
end $$;

-- Locking: at least 3 slots; the number of slots is fixed from here on.
create or replace function public.lock_circle(p_circle uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c circles; s text; h text; n int;
begin
  select * into c from circles where id = p_circle for update;
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if c.status <> 'forming' then raise exception 'Circle is not forming'; end if;
  n := _filled_slots(p_circle);
  if n < 3 then raise exception 'A paluwagan needs at least 3 members before it can be locked'; end if;
  update circles set slots = n where id = p_circle;
  perform _slot_groups(p_circle);

  s := encode(gen_random_bytes(32), 'hex');
  h := encode(digest(s, 'sha256'), 'hex');
  insert into circle_secrets (circle_id, seed) values (p_circle, s)
    on conflict (circle_id) do update set seed = excluded.seed;
  update circles set status = 'locked', seed_hash = h where id = p_circle;
  -- pending requests can no longer get in
  update circle_members set status = 'rejected' where circle_id = p_circle and status = 'pending';
  perform log_activity(p_circle, 'circle_locked', jsonb_build_object('seed_hash', h, 'slots', n));
  return h;
end $$;
