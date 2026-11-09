-- 0017: redo the draw (bunot ulit) before anyone has paid.
--
-- A paluwagan could start before members saw the payout order. The admin can now redo the
-- draw as long as nobody has submitted or confirmed a payment yet: the rounds and hulog are
-- removed and the paluwagan goes back to "Ready for the draw" with a NEW secret seed and
-- published fingerprint, so the next draw is just as verifiable. Every member sees it in
-- Activity, which keeps the admin honest.
--
-- Safe to run on top of 0001–0016.

create or replace function public.redo_draw(p_circle uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c circles; s text; h text;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can redo the draw'; end if;
  if c.status <> 'active' then raise exception 'Only a paluwagan that already started can be redrawn'; end if;
  if exists (select 1 from contributions
              where circle_id = p_circle and not auto and status in ('submitted', 'confirmed')) then
    raise exception 'Someone has already paid, so the draw can no longer be redone';
  end if;

  delete from contributions where circle_id = p_circle;
  delete from rounds where circle_id = p_circle;
  delete from swap_requests where circle_id = p_circle;
  update circle_members set slot_no = null where circle_id = p_circle;

  -- Fresh commitment, exactly like lock_circle.
  s := encode(gen_random_bytes(32), 'hex');
  h := encode(digest(s, 'sha256'), 'hex');
  insert into circle_secrets (circle_id, seed) values (p_circle, s)
    on conflict (circle_id) do update set seed = excluded.seed;
  update circles
     set status = 'locked', seed_hash = h, seed = null, draw_order = null, drawn_at = null,
         revealed_at = null, draw_style = null, replacing_member = null
   where id = p_circle;
  perform log_activity(p_circle, 'draw_redone', jsonb_build_object('seed_hash', h));
  return h;
end $$;

revoke all on function public.redo_draw(uuid) from public, anon;
grant execute on function public.redo_draw(uuid) to authenticated;
