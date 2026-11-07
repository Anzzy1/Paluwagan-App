-- Delete (with history) and pause for paluwagan.
--
-- DELETE is a soft delete: the admin can delete a paluwagan that won't push through, but
-- only before it starts ('forming' or 'locked'), so no payment records are involved.
-- It disappears for every member, stays in the admin's "Deleted" history, and can be
-- restored or permanently removed from there.
--
-- PAUSE is for emergencies on a running ('active') paluwagan. While paused, reminders
-- stop and everyone sees a notice. On resume, every hulog and payout that was not yet
-- due when the pause began moves later by the number of days it was paused.

alter table public.circles
  add column if not exists deleted_at   timestamptz,
  add column if not exists paused_at    timestamptz,
  add column if not exists pause_reason text check (pause_reason is null or char_length(pause_reason) <= 200);

-- No new join requests for a deleted paluwagan (covers request_join's insert and re-request update).
create or replace function public._block_join_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and exists (select 1 from circles where id = new.circle_id and deleted_at is not null) then
    raise exception 'This paluwagan was deleted by its admin';
  end if;
  return new;
end $$;

drop trigger if exists block_join_deleted on public.circle_members;
create trigger block_join_deleted before insert or update of status on public.circle_members
  for each row execute function public._block_join_deleted();

-- ---------------------------------------------------------------- delete / restore / purge

create or replace function public.delete_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can delete this paluwagan'; end if;
  if c.deleted_at is not null then return; end if;
  if c.status not in ('forming', 'locked') then
    raise exception 'This paluwagan has already started, so it can no longer be deleted. You can pause it instead.';
  end if;
  update circles set deleted_at = now() where id = p_circle;
  perform log_activity(p_circle, 'circle_deleted');
end $$;

create or replace function public.restore_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can restore this paluwagan'; end if;
  update circles set deleted_at = null where id = p_circle and deleted_at is not null;
  if not found then raise exception 'This paluwagan is not deleted'; end if;
  perform log_activity(p_circle, 'circle_restored');
end $$;

-- Permanent removal, only from the Deleted history. Cascades to members, invites and
-- activity; ipon goals linked to it are kept and unlinked (goals.circle_id ON DELETE SET NULL).
create or replace function public.purge_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can delete this paluwagan'; end if;
  if not exists (select 1 from circles where id = p_circle and deleted_at is not null) then
    raise exception 'Delete the paluwagan first; it can then be removed permanently from your history';
  end if;
  delete from circles where id = p_circle;
end $$;

-- ---------------------------------------------------------------- pause / resume

create or replace function public.pause_circle(p_circle uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can pause this paluwagan'; end if;
  if c.status <> 'active' then raise exception 'Only a running paluwagan can be paused'; end if;
  if c.paused_at is not null then raise exception 'This paluwagan is already paused'; end if;
  update circles set paused_at = now(), pause_reason = nullif(trim(p_reason), '') where id = p_circle;
  perform log_activity(p_circle, 'circle_paused', jsonb_build_object('reason', nullif(trim(p_reason), '')));
end $$;

create or replace function public.resume_circle(p_circle uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c circles; since date; shift int;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can resume this paluwagan'; end if;
  if c.paused_at is null then raise exception 'This paluwagan is not paused'; end if;

  since := (c.paused_at at time zone 'Asia/Manila')::date;
  shift := greatest(0, (now() at time zone 'Asia/Manila')::date - since);

  if shift > 0 then
    update rounds set due_date = due_date + shift
      where circle_id = p_circle and status <> 'completed' and due_date >= since;
    update contributions set due_date = due_date + shift
      where circle_id = p_circle and status in ('pending', 'rejected') and due_date is not null and due_date >= since;
  end if;

  update circles set paused_at = null, pause_reason = null where id = p_circle;
  perform log_activity(p_circle, 'circle_resumed', jsonb_build_object('days', shift));
  return shift;
end $$;

revoke all on function public.delete_circle(uuid) from public, anon;
revoke all on function public.restore_circle(uuid) from public, anon;
revoke all on function public.purge_circle(uuid) from public, anon;
revoke all on function public.pause_circle(uuid, text) from public, anon;
revoke all on function public.resume_circle(uuid) from public, anon;
revoke all on function public._block_join_deleted() from public, anon, authenticated;
grant execute on function public.delete_circle(uuid) to authenticated;
grant execute on function public.restore_circle(uuid) to authenticated;
grant execute on function public.purge_circle(uuid) to authenticated;
grant execute on function public.pause_circle(uuid, text) to authenticated;
grant execute on function public.resume_circle(uuid) to authenticated;
