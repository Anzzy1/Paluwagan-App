-- 0012: the minimum to lock is 3 people, not 3 slots.
-- Split-slot partners share one payout slot, so 3 people can be 2 slots
-- (e.g. one full member plus a split pair). Every split slot still needs a partner.
-- Safe to run on top of 0001–0011.

create or replace function public.lock_circle(p_circle uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c circles; s text; h text; n int; people int;
begin
  select * into c from circles where id = p_circle for update;
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if c.status <> 'forming' then raise exception 'Circle is not forming'; end if;
  select count(*) into people from circle_members where circle_id = p_circle and status = 'approved';
  if people < 3 then raise exception 'A paluwagan needs at least 3 members before it can be locked'; end if;
  n := _filled_slots(p_circle);
  if n < 2 then raise exception 'A paluwagan needs at least 2 payout slots'; end if;
  update circles set slots = n where id = p_circle;
  perform _slot_groups(p_circle); -- also checks every split slot has a partner

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
