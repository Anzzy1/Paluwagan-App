-- 0008: no self-confirm, release with unpaid hulog, late fee, Trust Score drops,
-- organizer covers a hulog, replacing a member mid-run.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1'; -- admin
  b uuid := '00000000-0000-0000-0000-0000000000b1'; -- doesn't pay, later replaced
  c uuid := '00000000-0000-0000-0000-0000000000c1'; -- round 1 recipient
  d uuid := '00000000-0000-0000-0000-0000000000d1';
  e uuid := '00000000-0000-0000-0000-0000000000e1'; -- replacement
  cid uuid; code text; ga uuid; gb uuid; gc uuid; gd uuid;
  r1 rounds; r2 rounds; kid uuid; mb uuid; me_ uuid; sc int; n int;
begin
  insert into auth.users (id, email) values (a,'a1@x'),(b,'b1@x'),(c,'c1@x'),(d,'d1@x'),(e,'e1@x');

  -- Weekly circle that started in the past, so every sahod date has arrived. Late fee 50, 1 grace day.
  perform pg_temp.login(a);
  cid := create_circle('Fair', '💰', 'mango', 1000, 4, 'weekly', '2026-01-05', 50, 1, '', 'manual');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(d); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  perform lock_circle(cid);
  select slot_group into ga from circle_members where circle_id = cid and user_id = a;
  select slot_group into gb from circle_members where circle_id = cid and user_id = b;
  select slot_group into gc from circle_members where circle_id = cid and user_id = c;
  select slot_group into gd from circle_members where circle_id = cid and user_id = d;
  perform set_manual_order(cid, array[gc, gd, ga, gb]); -- round 1 → C, round 2 → D
  select * into r1 from rounds where circle_id = cid and round_no = 1;
  select * into r2 from rounds where circle_id = cid and round_no = 2;

  -- ---- 1. The admin can't confirm their own payment
  select id into kid from contributions where round_id = r1.id and user_id = a;
  perform submit_proof(kid, cid || '/' || a || '/r.jpg');
  -- 0019: the admin holds the money, so they record their own hulog
  perform review_contribution(kid, true);
  assert (select late_fee from contributions where id = kid) = 50, 'late payment records the late fee';
  assert (select on_time from contributions where id = kid) = false, 'paid long after due → late';

  -- D pays but members can't confirm their own payment
  perform pg_temp.login(d);
  select id into kid from contributions where round_id = r1.id and user_id = d;
  perform submit_proof(kid, cid || '/' || d || '/r.jpg');
  begin
    perform review_contribution(kid, true);
    assert false, 'members must not confirm their own payment';
  exception when raise_exception then null; end;
  perform pg_temp.login(c);
  perform review_contribution(kid, true);
  assert (select status from rounds where id = r1.id) = 'active', 'round 1 still open while B is unpaid';

  -- ---- 2. Release the sahod with B unpaid: the paluwagan moves on
  perform pg_temp.login(c);
  begin
    perform release_round(cid);
    assert false, 'only the admin can release';
  exception when raise_exception then null; end;
  perform pg_temp.login(a);
  perform release_round(cid);
  assert (select status from rounds where id = r1.id) = 'completed', 'round 1 released';
  assert (select status from rounds where id = r2.id) = 'active', 'round 2 now current';
  assert (select status from contributions where round_id = r1.id and user_id = b) = 'pending', 'B still owes round 1';

  -- ---- 4. Trust Score drops for the missed hulog
  select tiwala_score into sc from profiles where id = b;
  assert sc < 80, 'missed hulog lowers trust (' || sc || ')';

  -- B pays round 1 late: confirmed with late fee, round 1 stays completed, round 2 stays current
  perform pg_temp.login(b);
  select id into kid from contributions where round_id = r1.id and user_id = b;
  perform submit_proof(kid, cid || '/' || b || '/late.jpg');
  perform pg_temp.login(c);
  perform review_contribution(kid, true);
  assert (select late_fee from contributions where id = kid) = 50, 'arrears record the late fee';
  assert (select status from rounds where id = r2.id) = 'active', 'paying arrears doesn’t skip a round';
  assert (select count(*) from rounds where circle_id = cid and status = 'active') = 1, 'exactly one current round';

  -- ---- 3a. The organizer covers B's round-2 hulog
  perform pg_temp.login(a);
  select id into kid from contributions where round_id = r2.id and user_id = b;
  perform cover_contribution(kid, null);
  assert (select covered_by from contributions where id = kid) = a, 'covered by the admin';
  assert (select status from contributions where id = kid) = 'confirmed', 'covered hulog counts as paid';
  begin
    perform cover_contribution((select id from contributions where round_id = r2.id and user_id = a), null);
    assert false, 'admin must not cover own hulog';
  exception when raise_exception then null; end;

  -- ---- 3b. Replace B with E
  select id into mb from circle_members where circle_id = cid and user_id = b;
  perform pg_temp.login(e);
  begin
    perform request_join(code, false);
    assert false, 'running paluwagan rejects joins until a slot is opened';
  exception when raise_exception then null; end;
  perform pg_temp.login(a);
  perform open_replacement(mb);
  perform pg_temp.login(e);
  me_ := request_join(code, false);
  perform pg_temp.login(a);
  begin
    perform review_member(me_, true);
    assert false, 'running paluwagan approves only through replace_member';
  exception when raise_exception then null; end;
  perform replace_member(me_);
  assert (select status from circle_members where id = mb) = 'left', 'B is out';
  assert (select slot_group from circle_members where id = me_) = gb, 'E took B’s slot (and payout)';
  select count(*) into n from contributions k join rounds r on r.id = k.round_id
   where k.circle_id = cid and k.user_id = e and k.status = 'pending';
  assert n = 2, 'E owes the unpaid hulog of rounds 3 and 4 (' || n || ')';
  assert (select slot_group from rounds where circle_id = cid and round_no = 4) = gb, 'E gets B’s round-4 payout (same slot)';
  assert (select user_id from contributions where round_id = r1.id and member_id = mb) = b, 'B’s history stays with B';
  assert (select replacing_member from circles where id = cid) is null, 'replacement closed';

  raise notice '✅ fair rounds assertions passed';
end $$;
