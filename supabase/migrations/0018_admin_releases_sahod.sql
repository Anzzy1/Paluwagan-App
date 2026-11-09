-- 0018: the admin releases each sahod.
--
-- Rounds used to finish on their own once every hulog was confirmed. Now the round stays
-- open until the admin taps Release sahod, which is also when the recipient is announced.
-- The admin can release once the sahod date arrives, or earlier if everyone has paid.
--
-- Safe to run on top of 0001–0017.

-- Confirming the last hulog no longer finishes the round.
create or replace function public._finish_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Kept for callers (review_contribution, cover_contribution); the admin releases the sahod.
  return;
end $$;
revoke execute on function public._finish_round(uuid) from public, anon, authenticated;

create or replace function public.release_round(p_circle uuid)
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

  select count(*) filter (where status <> 'confirmed'),
         coalesce(sum(amount) filter (where status <> 'confirmed'), 0),
         coalesce(sum(amount) filter (where status = 'confirmed'), 0)
    into unpaid_n, unpaid_amt, paid_amt
    from contributions where round_id = r.id;

  -- Early release only when everyone has paid.
  if r.due_date > (now() at time zone 'Asia/Manila')::date and unpaid_n > 0 then
    raise exception 'The sahod date hasn’t arrived yet. You can release early once everyone has paid.';
  end if;

  update rounds set status = 'completed', completed_at = now() where id = r.id;
  perform log_activity(p_circle, 'round_released',
    jsonb_build_object('round_no', r.round_no, 'unpaid', unpaid_n, 'unpaid_amount', unpaid_amt, 'paid_amount', paid_amt,
                       'recipients', (select jsonb_agg(user_id) from circle_members
                                       where circle_id = p_circle and slot_group = r.slot_group and status = 'approved')));
  perform _activate_next(p_circle);

  -- Missed hulog now count against the members who didn't pay.
  for u in select distinct user_id from contributions where round_id = r.id and status <> 'confirmed' loop
    perform recompute_tiwala(u);
  end loop;
end $$;
