-- 0021: advance sahod with the amount given and the day hulog continues.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a9';
  b uuid := '00000000-0000-0000-0000-0000000000b9';
  c uuid := '00000000-0000-0000-0000-0000000000c9';
  cid uuid; code text; r1 uuid; first_unpaid date; d2 date; last_before date; pot numeric;
begin
  insert into auth.users (id, email) values (a,'a9@x'),(b,'b9@x'),(c,'c9@x');
  perform pg_temp.login(a);
  -- Daily hulog of 100, weekly sahod, far in the future
  cid := create_circle('Daily', '💰', 'mango', 100, 50, 'daily', '2030-06-03', 0, 0, '', 'draw', null, null, 'weekly', null, '2030-06-09');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  perform lock_circle(cid);
  perform run_draw(cid);
  perform reveal_draw(cid);

  select id into r1 from rounds where circle_id = cid and round_no = 1;
  select sum(amount) into pot from contributions where round_id = r1;
  select due_date into d2 from rounds where circle_id = cid and round_no = 2;
  select max(due_date) into last_before from contributions where circle_id = cid;

  -- Everyone pays the first hulog day
  perform review_contribution(id, true) from contributions where round_id = r1 and due_date = '2030-06-03';
  select min(due_date) into first_unpaid from contributions where circle_id = cid and status = 'pending';
  assert first_unpaid = '2030-06-04', 'next unpaid hulog is the 4th';

  -- Checks: amount and resume date
  begin perform advance_sahod(cid, 0, null); assert false, 'amount must be positive';
  exception when raise_exception then null; end;
  begin perform advance_sahod(cid, pot + 1, null); assert false, 'cannot give more than the sahod';
  exception when raise_exception then null; end;
  begin perform advance_sahod(cid, 300, '2030-06-03'); assert false, 'cannot resume before the next unpaid hulog';
  exception when raise_exception then null; end;
  perform pg_temp.login(b);
  begin perform advance_sahod(cid, 300, null); assert false, 'member cannot advance';
  exception when raise_exception then null; end;

  -- Give 300 now, hulog continues on the 7th (3 days later than planned)
  perform pg_temp.login(a);
  perform advance_sahod(cid, 300, '2030-06-07');
  assert (select status from rounds where id = r1) = 'completed', 'round 1 released';
  assert (select advance_given from rounds where id = r1) = 300, 'amount recorded';
  assert not exists (select 1 from contributions where circle_id = cid and due_date between '2030-06-04' and '2030-06-06'), 'gap left for the pause';
  assert exists (select 1 from contributions where circle_id = cid and due_date = '2030-06-07'), 'hulog continues on the 7th';
  assert (select count(*) from contributions where circle_id = cid and due_date = '2030-06-03') = 3, 'paid day did not move';
  assert (select max(due_date) from contributions where circle_id = cid) = last_before + 3, 'last hulog moved 3 days';
  assert (select due_date from rounds where circle_id = cid and round_no = 2) = d2 + 3, 'next sahod moved 3 days';
  assert (select (payload->>'given')::numeric from activity where circle_id = cid and type = 'sahod_advanced') = 300, 'logged with amount';

  -- The balance is given later, once
  perform release_sahod_balance(cid, r1);
  assert (select balance_released_at from rounds where id = r1) is not null, 'balance given';
  assert (select (payload->>'amount')::numeric from activity where circle_id = cid and type = 'sahod_balance_released') = pot - 300, 'balance logged';
  begin perform release_sahod_balance(cid, r1); assert false, 'balance only once';
  exception when raise_exception then null; end;

  -- Full amount, continue as scheduled: no balance, nothing moves
  select due_date into d2 from rounds where circle_id = cid and round_no = 3;
  perform advance_sahod(cid, (select sum(amount) from contributions k join rounds r on r.id = k.round_id where r.circle_id = cid and r.round_no = 2), null);
  assert (select due_date from rounds where circle_id = cid and round_no = 3) = d2, 'no shift without a resume date';
  begin perform release_sahod_balance(cid, (select id from rounds where circle_id = cid and round_no = 2)); assert false, 'no balance when fully given';
  exception when raise_exception then null; end;

  raise notice '✅ advance amount and resume assertions passed';
end $$;
