-- 0021: Advance sahod records how much was handed over and when hulog continues.
--
-- advance_sahod(p_circle, p_given, p_resume):
--   * p_given: what the recipient actually got now (can be less than the full sahod, e.g. when
--     not enough hulog is in yet). The rest is their balance, given later with
--     release_sahod_balance once the remaining hulog are collected.
--   * p_resume: the day hulog continues. If it's later than the next unpaid hulog date, every
--     hulog from that date on (and every sahod not yet released) moves by the same number of days.
-- The 1-argument advance_sahod from 0020 still works (gives the full collected amount, no shift).
--
-- Safe to run on top of 0001–0020.

alter table public.rounds add column if not exists advance_given numeric(12,2);
alter table public.rounds add column if not exists balance_released_at timestamptz;

-- Shared release (0020) with extra activity details.
create or replace function public._release_sahod(p_circle uuid, p_early boolean, p_extra jsonb)
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
                                       where circle_id = p_circle and slot_group = r.slot_group and status = 'approved'))
    || coalesce(p_extra, '{}'::jsonb));
  perform _activate_next(p_circle);

  for u in select distinct user_id from contributions where round_id = r.id and status <> 'confirmed' loop
    perform recompute_tiwala(u);
  end loop;
end $$;
revoke execute on function public._release_sahod(uuid, boolean, jsonb) from public, anon, authenticated;

create or replace function public.release_round(p_circle uuid)
returns void language sql security definer set search_path = public as $$
  select _release_sahod(p_circle, false, '{}'::jsonb);
$$;

create or replace function public.advance_sahod(p_circle uuid)
returns void language sql security definer set search_path = public as $$
  select _release_sahod(p_circle, true, '{}'::jsonb);
$$;

drop function if exists public._release_sahod(uuid, boolean);

create or replace function public.advance_sahod(p_circle uuid, p_given numeric, p_resume date)
returns void language plpgsql security definer set search_path = public as $$
declare
  c circles; r rounds; pot numeric; anchor date; shift int := 0;
  today date := (now() at time zone 'Asia/Manila')::date;
  far constant int := 100000;
begin
  select * into c from circles where id = p_circle for update;
  if not found then raise exception 'Paluwagan not found'; end if;
  if not is_admin(p_circle) then raise exception 'Only the admin can release the sahod'; end if;
  select * into r from rounds where circle_id = p_circle and status = 'active' for update;
  if not found then raise exception 'There is no current round'; end if;

  select coalesce(sum(amount), 0) into pot from contributions where round_id = r.id;
  if p_given is null or p_given <= 0 then raise exception 'Enter how much the recipient got'; end if;
  if p_given > pot then raise exception 'That’s more than this sahod (₱%)', pot; end if;

  -- The next hulog date nobody has paid yet: hulog continues from here.
  select min(d) into anchor from (
    select coalesce(k.due_date, rr.due_date) as d
      from contributions k join rounds rr on rr.id = k.round_id
     where k.circle_id = p_circle and coalesce(k.due_date, rr.due_date) >= today
     group by 1
    having count(*) filter (where k.status in ('submitted', 'confirmed')) = 0
  ) x;

  if anchor is not null and p_resume is not null then
    if p_resume < anchor then
      raise exception 'Hulog can continue on % at the earliest', to_char(anchor, 'Mon FMDD, YYYY');
    end if;
    shift := p_resume - anchor;
  end if;

  if shift > 0 then
    -- Two steps so moved dates never collide with ones not yet moved (unique per member and date).
    update contributions set due_date = due_date + far + shift where circle_id = p_circle and due_date >= anchor;
    update contributions set due_date = due_date - far where circle_id = p_circle and due_date >= anchor + far;
    update rounds set due_date = due_date + shift
     where circle_id = p_circle and status <> 'completed' and due_date >= anchor;
  end if;

  update rounds set advance_given = p_given where id = r.id;
  perform _release_sahod(p_circle, true,
    jsonb_build_object('due', r.due_date, 'given', p_given, 'pot', pot, 'resume', coalesce(p_resume, anchor), 'shift', shift));
end $$;

-- The rest of an advanced sahod, handed over once the remaining hulog are in.
create or replace function public.release_sahod_balance(p_circle uuid, p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rounds; pot numeric;
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can release the sahod'; end if;
  select * into r from rounds where id = p_round and circle_id = p_circle for update;
  if not found then raise exception 'Round not found'; end if;
  select coalesce(sum(amount), 0) into pot from contributions where round_id = r.id;
  if r.status <> 'completed' or r.advance_given is null or pot <= r.advance_given then
    raise exception 'This sahod has no balance to give';
  end if;
  if r.balance_released_at is not null then raise exception 'The balance was already given'; end if;
  update rounds set balance_released_at = now() where id = r.id;
  perform log_activity(p_circle, 'sahod_balance_released',
    jsonb_build_object('round_no', r.round_no, 'amount', pot - r.advance_given, 'given', r.advance_given, 'pot', pot,
                       'recipients', (select jsonb_agg(user_id) from circle_members
                                       where circle_id = p_circle and slot_group = r.slot_group and status = 'approved')));
end $$;

revoke all on function public.advance_sahod(uuid, numeric, date) from public, anon;
revoke all on function public.release_sahod_balance(uuid, uuid) from public, anon;
grant execute on function public.advance_sahod(uuid, numeric, date) to authenticated;
grant execute on function public.release_sahod_balance(uuid, uuid) to authenticated;
