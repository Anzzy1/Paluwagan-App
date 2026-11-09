-- 0020: advance or delay the sahod in online paluwagan (like the offline one).
--
-- advance_sahod: release the current sahod before its date, even if some hulog are unpaid
--   (they stay on record as overdue). release_round keeps its rules: on the date, or early
--   once everyone has paid.
-- delay_sahod: move the current sahod to a later date, optionally moving the later sahod
--   by the same number of days. Hulog dates don't change.
--
-- Safe to run on top of 0001–0019.

-- Shared release; p_early skips the date rule.
create or replace function public._release_sahod(p_circle uuid, p_early boolean)
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

  if not p_early and r.due_date > (now() at time zone 'Asia/Manila')::date and unpaid_n > 0 then
    raise exception 'The sahod date hasn’t arrived yet. You can release early once everyone has paid, or use Advance sahod.';
  end if;

  update rounds set status = 'completed', completed_at = now() where id = r.id;
  perform log_activity(p_circle, case when p_early and r.due_date > (now() at time zone 'Asia/Manila')::date then 'sahod_advanced' else 'round_released' end,
    jsonb_build_object('round_no', r.round_no, 'unpaid', unpaid_n, 'unpaid_amount', unpaid_amt, 'paid_amount', paid_amt,
                       'due', r.due_date,
                       'recipients', (select jsonb_agg(user_id) from circle_members
                                       where circle_id = p_circle and slot_group = r.slot_group and status = 'approved')));
  perform _activate_next(p_circle);

  for u in select distinct user_id from contributions where round_id = r.id and status <> 'confirmed' loop
    perform recompute_tiwala(u);
  end loop;
end $$;
revoke execute on function public._release_sahod(uuid, boolean) from public, anon, authenticated;

create or replace function public.release_round(p_circle uuid)
returns void language sql security definer set search_path = public as $$
  select _release_sahod(p_circle, false);
$$;

create or replace function public.advance_sahod(p_circle uuid)
returns void language sql security definer set search_path = public as $$
  select _release_sahod(p_circle, true);
$$;

create or replace function public.delay_sahod(p_circle uuid, p_new_date date, p_shift_later boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare c circles; r rounds; nxt rounds; days int;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can move the sahod'; end if;
  if c.status <> 'active' then raise exception 'This paluwagan is not running'; end if;
  select * into r from rounds where circle_id = p_circle and status = 'active' for update;
  if not found then raise exception 'There is no current round'; end if;
  if p_new_date <= r.due_date then raise exception 'Pick a date after the current sahod date'; end if;
  days := p_new_date - r.due_date;

  if not p_shift_later then
    select * into nxt from rounds where circle_id = p_circle and round_no = r.round_no + 1;
    if found and p_new_date >= nxt.due_date then
      raise exception 'That’s on or after the next sahod. Move the later sahod too to keep the order.';
    end if;
  end if;

  update rounds set due_date = p_new_date where id = r.id;
  if p_shift_later then
    update rounds set due_date = due_date + days
     where circle_id = p_circle and status = 'upcoming' and round_no > r.round_no;
  end if;
  perform log_activity(p_circle, 'sahod_delayed',
    jsonb_build_object('round_no', r.round_no, 'from', r.due_date, 'to', p_new_date, 'days', days, 'shift_later', p_shift_later));
end $$;

revoke all on function public.advance_sahod(uuid) from public, anon;
revoke all on function public.delay_sahod(uuid, date, boolean) from public, anon;
grant execute on function public.advance_sahod(uuid) to authenticated;
grant execute on function public.delay_sahod(uuid, date, boolean) to authenticated;
