-- 0016: no paying before the payout order is revealed.
--
-- The draw result is fixed the moment the admin starts it (verifiable seed), but the
-- animation might be stopped halfway. Until the admin finishes it (or taps Show results),
-- the order counts as not yet declared: members can't submit payments.
-- Manually ordered paluwagan are revealed as soon as the admin sets the order.
--
-- Safe to run on top of 0001–0015.

alter table public.circles add column if not exists revealed_at timestamptz;

-- Paluwagan that already started keep working.
update public.circles set revealed_at = coalesce(drawn_at, now())
 where revealed_at is null and status in ('active', 'completed');

-- Admin: declare the payout order (after the draw animation, or by skipping it).
create or replace function public.reveal_draw(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Only the admin can reveal the draw'; end if;
  update circles set revealed_at = now()
   where id = p_circle and revealed_at is null and status = 'active';
  if found then perform log_activity(p_circle, 'draw_revealed'); end if;
end $$;

-- Manual order: the admin typed it in, so it's declared right away.
create or replace function public._reveal_manual_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_mode = 'manual' and new.status = 'active' and old.status <> 'active' and new.revealed_at is null then
    new.revealed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public._reveal_manual_order() from public, anon, authenticated;

drop trigger if exists reveal_manual_order on public.circles;
create trigger reveal_manual_order before update of status on public.circles
  for each row execute function public._reveal_manual_order();

-- Paying: only after the payout order is revealed.
create or replace function public.submit_proof(p_contribution uuid, p_proof_path text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found or k.user_id <> auth.uid() then raise exception 'Not your contribution'; end if;
  if (select revealed_at from circles where id = k.circle_id) is null then
    raise exception 'The payout order hasn’t been revealed yet. Payments open once the draw is finished.';
  end if;
  if k.status not in ('pending', 'rejected') then raise exception 'Already submitted'; end if;
  update contributions set status = 'submitted', proof_path = p_proof_path, note = p_note,
         submitted_at = now(), reject_reason = null
   where id = p_contribution;
  perform log_activity(k.circle_id, 'proof_submitted',
    jsonb_build_object('round_id', k.round_id, 'amount', k.amount));
end $$;

revoke all on function public.reveal_draw(uuid) from public, anon;
grant execute on function public.reveal_draw(uuid) to authenticated;
