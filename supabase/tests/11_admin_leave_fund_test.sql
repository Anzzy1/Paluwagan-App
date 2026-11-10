-- 0023: hand over admin, leave with a refund, fund deductions, where to pay.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000ab';
  b uuid := '00000000-0000-0000-0000-0000000000bb';
  c uuid := '00000000-0000-0000-0000-0000000000cb';
  d uuid := '00000000-0000-0000-0000-0000000000db';
  cid uuid; code text; mid uuid; adj uuid; first_group uuid;
begin
  insert into auth.users (id, email) values (a,'ab@x'),(b,'bb@x'),(c,'cb@x'),(d,'db@x');
  perform pg_temp.login(a);
  cid := create_circle('Office', '💰', 'mango', 500, 50, 'weekly', '2030-06-03', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(d); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';

  -- Where to pay
  perform set_pay_info(cid, 'gcash', 'Ana Admin', '09171234567', 'Send before 8 PM', null);
  assert (select pay_number from circles where id = cid) = '09171234567', 'pay info saved';
  perform set_pay_info(cid, null, 'x', 'y', null, null);
  assert (select pay_name from circles where id = cid) is null, 'face to face clears details';

  -- The admin can't leave; hand over first
  begin perform force_leave(cid); assert false, 'admin cannot leave';
  exception when raise_exception then null; end;
  perform offer_admin(cid, b);
  perform pg_temp.login(c);
  begin perform answer_admin_offer(cid, true); assert false, 'only the offered member answers';
  exception when raise_exception then null; end;
  perform pg_temp.login(b);
  perform answer_admin_offer(cid, true);
  assert (select role from circle_members where circle_id = cid and user_id = b) = 'admin', 'b is admin';
  assert (select role from circle_members where circle_id = cid and user_id = a) = 'member', 'a is a member now';

  -- Forming: a leaves right away
  perform pg_temp.login(a);
  perform force_leave(cid);
  assert (select status from circle_members where circle_id = cid and user_id = a) = 'left', 'a left';

  -- Start with b, c, d
  perform pg_temp.login(b);
  perform lock_circle(cid);
  perform run_draw(cid);
  perform reveal_draw(cid);

  -- Deductions
  perform add_deduction(cid, 200, 'Bank fee');
  select id into adj from fund_adjustments where circle_id = cid and kind = 'deduction';
  assert (select amount from fund_adjustments where id = adj) = 200, 'deduction recorded';
  perform pg_temp.login(c);
  begin perform add_deduction(cid, 50, 'x'); assert false, 'member cannot deduct';
  exception when raise_exception then null; end;
  perform pg_temp.login(b);
  perform remove_deduction(adj);
  assert not exists (select 1 from fund_adjustments where id = adj), 'deduction removed';

  -- The first recipient can't leave after getting their sahod
  select slot_group into first_group from rounds where circle_id = cid and round_no = 1;
  perform advance_sahod(cid);

  -- Someone who hasn't had their sahod asks to leave and gets a refund
  select id into mid from circle_members where circle_id = cid and status = 'approved' and role = 'member' and slot_group <> first_group limit 1;
  perform pg_temp.login((select user_id from circle_members where id = mid));
  perform request_leave(cid, 'Moving abroad');
  assert (select leave_requested_at from circle_members where id = mid) is not null, 'request saved';
  perform pg_temp.login(b);
  perform approve_leave(mid, 500);
  assert (select status from circle_members where id = mid) = 'left', 'member left';
  -- 0026: no replacement; the schedule is recalculated without them
  assert (select replacing_member from circles where id = cid) is null, 'no replacement needed';
  assert (select count(*) from rounds where circle_id = cid) = 2, 'one turn dropped';
  assert not exists (select 1 from contributions k join rounds r on r.id = k.round_id
                      where k.member_id = mid and k.status = 'pending' and r.status <> 'completed'), 'their unpaid hulog dropped';
  assert (select count(distinct slot_group) from rounds where circle_id = cid) = 2, 'each remaining member has one turn';
  assert not exists (select 1 from rounds r where circle_id = cid
                      and not exists (select 1 from circle_members m where m.slot_group = r.slot_group and m.status = 'approved')),
         'every turn belongs to someone still in';
  assert (select amount from fund_adjustments where circle_id = cid and kind = 'refund') = 500, 'refund recorded';
  assert (select count(*) from fund_gives where circle_id = cid and given_at is null) = 1, 'refund waiting to be given';
  perform mark_given((select id from fund_gives where circle_id = cid), true);
  assert (select given_at from fund_gives where circle_id = cid) is not null, 'marked given';

  -- The one who got the sahod can't leave
  perform pg_temp.login((select user_id from circle_members where circle_id = cid and slot_group = first_group and status = 'approved' limit 1));
  if (select role from circle_members where circle_id = cid and user_id = auth.uid()) = 'member' then
    begin perform force_leave(cid); assert false, 'already got sahod';
    exception when raise_exception then null; end;
  end if;

  -- 0024: the join screen shows the current admin
  perform pg_temp.login(d);
  assert (select admin_name from preview_circle(code)) = (select full_name from profiles where id = b), 'preview shows the current admin';
  assert not exists (select 1 from fund_adjustments where circle_id = cid and kind = 'split'), 'nothing paid in, nothing to split';

  raise notice '✅ admin hand-over, leave, fund and pay info assertions passed';
end $$;
