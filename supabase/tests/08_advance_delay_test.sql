-- 0020: advance or delay the sahod.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a8';
  b uuid := '00000000-0000-0000-0000-0000000000b8';
  c uuid := '00000000-0000-0000-0000-0000000000c8';
  cid uuid; code text; d2 date; d3 date;
begin
  insert into auth.users (id, email) values (a,'a8@x'),(b,'b8@x'),(c,'c8@x');
  perform pg_temp.login(a);
  -- Far in the future, so no sahod date has arrived yet
  cid := create_circle('Later', '💰', 'mango', 500, 50, 'weekly', '2030-06-03', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  perform lock_circle(cid);
  perform run_draw(cid);
  perform reveal_draw(cid);

  -- Regular release must wait for the date (nobody paid)
  begin
    perform release_round(cid);
    assert false, 'release waits for the sahod date';
  exception when raise_exception then null; end;

  -- Members can't advance or delay
  perform pg_temp.login(b);
  begin perform advance_sahod(cid); assert false, 'member cannot advance';
  exception when raise_exception then null; end;
  begin perform delay_sahod(cid, '2030-07-01', true); assert false, 'member cannot delay';
  exception when raise_exception then null; end;

  -- Advance: round 1 released early, round 2 is current
  perform pg_temp.login(a);
  perform advance_sahod(cid);
  assert (select status from rounds where circle_id = cid and round_no = 1) = 'completed', 'advanced';
  assert (select status from rounds where circle_id = cid and round_no = 2) = 'active', 'round 2 current';
  assert exists (select 1 from activity where circle_id = cid and type = 'sahod_advanced'), 'logged as advanced';

  -- Delay round 2 by 3 days and move round 3 too
  select due_date into d2 from rounds where circle_id = cid and round_no = 2;
  select due_date into d3 from rounds where circle_id = cid and round_no = 3;
  perform delay_sahod(cid, d2 + 3, true);
  assert (select due_date from rounds where circle_id = cid and round_no = 2) = d2 + 3, 'round 2 moved';
  assert (select due_date from rounds where circle_id = cid and round_no = 3) = d3 + 3, 'round 3 moved too';

  -- Without moving the rest, it can't pass the next sahod
  begin
    perform delay_sahod(cid, d3 + 10, false);
    assert false, 'cannot jump past the next sahod';
  exception when raise_exception then null; end;
  begin
    perform delay_sahod(cid, d2, true);
    assert false, 'must be later than the current date';
  exception when raise_exception then null; end;

  raise notice '✅ advance and delay sahod assertions passed';
end $$;
