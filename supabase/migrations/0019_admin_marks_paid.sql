-- 0019: the admin keeps the hulog checklist.
--
-- Members pay the admin, who confirms each scheduled hulog, with or without a receipt
-- (the admin knows who handed over cash). Since the admin holds the money and the
-- recipient is only announced at the sahod, the admin can also record their own hulog.
-- Everyone still sees each confirmation in Activity.
--
-- Same as 0008's review_contribution otherwise. Safe to run on top of 0001–0018.

create or replace function public.review_contribution(p_contribution uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions; r rounds; c circles; is_recipient boolean; admin boolean; late boolean;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found then raise exception 'Not found'; end if;
  select * into r from rounds where id = k.round_id;
  select * into c from circles where id = k.circle_id;
  admin := is_admin(k.circle_id);
  is_recipient := exists (select 1 from circle_members where slot_group = r.slot_group
                          and user_id = auth.uid() and status = 'approved');
  if not (is_recipient or admin) then raise exception 'Recipient or admin only'; end if;
  -- Members never confirm their own payment; the admin (who holds the money) may.
  if k.user_id = auth.uid() and not admin then
    raise exception 'You can’t confirm your own payment. The admin confirms it.';
  end if;
  if k.status not in ('submitted', 'pending', 'rejected') then raise exception 'Nothing to review'; end if;
  if not p_approve and k.status <> 'submitted' then raise exception 'Only a submitted receipt can be rejected'; end if;

  if p_approve then
    late := coalesce(k.submitted_at, now())::date > coalesce(k.due_date, r.due_date) + c.grace_days;
    update contributions set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
           on_time = not late,
           late_fee = case when late then c.late_fee else 0 end,
           reject_reason = null
     where id = p_contribution;
    perform recompute_tiwala(k.user_id);
    perform log_activity(k.circle_id, 'payment_confirmed',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'amount', k.amount,
                         'due', coalesce(k.due_date, r.due_date), 'no_receipt', k.proof_path is null,
                         'late_fee', case when late then c.late_fee else 0 end));
    perform _finish_round(r.id);
  else
    update contributions set status = 'rejected', reject_reason = p_reason where id = p_contribution;
    perform log_activity(k.circle_id, 'payment_rejected',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'reason', p_reason));
  end if;
end $$;

-- Everyone pays every hulog, the sahod recipient included. Their own share used to be
-- confirmed automatically, which also gave away who receives the sahod.
create or replace function public._add_hulog(p_round uuid, p_circle uuid, p_amount numeric, p_group uuid, p_due date)
returns void language sql security definer set search_path = public as $$
  insert into contributions (round_id, circle_id, member_id, user_id, amount, status, auto, confirmed_at, due_date)
  select p_round, p_circle, m.id, m.user_id, p_amount * m.share, 'pending', false, null, p_due
  from circle_members m where m.circle_id = p_circle and m.status = 'approved';
$$;
revoke execute on function public._add_hulog(uuid, uuid, numeric, uuid, date) from public, anon, authenticated;

-- Open rounds: the recipient's auto-confirmed share becomes a normal hulog to pay.
update public.contributions k
   set status = 'pending', auto = false, confirmed_at = null
  from public.rounds r
 where r.id = k.round_id and k.auto and r.status <> 'completed';

-- Turn swaps: just trade the two payout rounds. There are no auto-confirmed shares to move.
create or replace function public._execute_swap(s swap_requests)
returns void language plpgsql security definer set search_path = public as $$
declare ga uuid; gb uuid; ra rounds; rb rounds;
begin
  select slot_group into ga from circle_members where id = s.from_member;
  select slot_group into gb from circle_members where id = s.to_member;
  select * into ra from rounds where circle_id = s.circle_id and slot_group = ga;
  select * into rb from rounds where circle_id = s.circle_id and slot_group = gb;
  if ra.status <> 'upcoming' or rb.status <> 'upcoming' then raise exception 'Slots already started'; end if;

  update rounds set slot_group = gb where id = ra.id;
  update rounds set slot_group = ga where id = rb.id;
  update circle_members set slot_no = rb.round_no where circle_id = s.circle_id and slot_group = ga;
  update circle_members set slot_no = ra.round_no where circle_id = s.circle_id and slot_group = gb;
end $$;
revoke execute on function public._execute_swap(swap_requests) from public, anon, authenticated;
