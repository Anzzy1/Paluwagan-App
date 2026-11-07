-- Let the admin delete a paluwagan that won't push through.
--
-- Only allowed before it starts ('forming' or 'locked'): no rounds exist yet and no money
-- has been recorded, so nothing of value is lost. Once 'active' or 'completed', the
-- payment history must stay, so deletion is refused.
-- Deleting cascades to members, invites, passwords and the activity log; ipon goals
-- linked to it are kept and simply unlinked (goals.circle_id is ON DELETE SET NULL).

create or replace function public.delete_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c circles;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can delete this paluwagan'; end if;
  if c.status not in ('forming', 'locked') then
    raise exception 'This paluwagan has already started, so it can no longer be deleted. Its payment records must be kept.';
  end if;
  delete from circles where id = p_circle;
end $$;

revoke all on function public.delete_circle(uuid) from public, anon;
grant execute on function public.delete_circle(uuid) to authenticated;
