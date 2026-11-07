-- Daily / custom hulog, separate sahod schedule, and join passwords (migrations 0004–0005).
-- Run with: bash supabase/tests/run.sh
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

do $$
declare
  g uuid := '00000000-0000-0000-0000-000000000101';
  h uuid := '00000000-0000-0000-0000-000000000102';
  i uuid := '00000000-0000-0000-0000-000000000103';
  cid uuid; code text; res uuid; n int; r1 rounds; r2 rounds;
begin
  perform pg_temp.logout();
  -- ---- schedule math
  assert round_due_date('daily', '2026-11-09', 1, null) = '2026-11-09';
  assert round_due_date('daily', '2026-11-09', 8, null) = '2026-11-16';
  assert round_due_date('custom', '2026-11-09', 3, 3) = '2026-11-15', 'every 3 days';
  assert round_due_date('weekly', '2026-11-09', 2, null) = '2026-11-16', '4-arg falls back to 3-arg';

  insert into auth.users (id, email) values (g, 'g@x'), (h, 'h@x'), (i, 'i@x');

  -- ---- daily hulog, weekly sahod, password protected
  perform pg_temp.login(g);
  begin
    perform create_circle('Bad', '💰', 'leaf', 100, 2, 'daily', '2026-11-09', 0, 0, '', 'draw', null, 'abcd', 'weekly', null, '2026-11-01');
    assert false, 'first sahod before first hulog must fail';
  exception when raise_exception or check_violation then null; end;
  begin
    perform create_circle('Bad', '💰', 'leaf', 100, 2, 'daily', '2026-11-09', 0, 0, '', 'draw', null, 'ab');
    assert false, 'short password must fail';
  exception when raise_exception then null; end;

  cid := create_circle('Sari-sari', '💰', 'leaf', 100, 2, 'daily', '2026-11-09', 0, 0, '', 'draw', null, 'abcd', 'weekly', null, '2026-11-15');
  select invite_code into code from circles where id = cid;
  assert (select has_password from circles where id = cid), 'has_password set';
  assert (select count(*) from circle_passwords) = 0, 'password hashes are unreadable';

  -- ---- joining needs the password
  perform pg_temp.login(h);
  assert (select has_password from preview_circle(code)), 'preview shows password requirement';
  assert (select payout_frequency from preview_circle(code)) = 'weekly', 'preview shows sahod schedule';
  res := request_join(code, false, null);
  assert res is null, 'no password -> null';
  res := request_join(code, false, 'wrong');
  assert res is null, 'wrong password -> null';
  res := request_join(code, false, 'abcd');
  assert res is not null, 'right password joins';

  -- throttling: 5 wrong tries in 15 minutes locks the user out
  perform pg_temp.login(i);
  for n in 1..5 loop perform request_join(code, false, 'nope'); end loop;
  begin
    perform request_join(code, false, 'abcd');
    assert false, 'throttled after 5 wrong passwords';
  exception when raise_exception then null; end;

  -- admin can change the password; activity is logged
  perform pg_temp.login(g);
  perform set_circle_password(cid, 'newpass');
  perform pg_temp.login(h);
  begin perform set_circle_password(cid, 'hack'); assert false, 'only admin sets password';
  exception when raise_exception then null; end;

  -- ---- start the circle: 2 payouts, 7 daily hulog each
  perform pg_temp.login(g);
  perform review_member((select id from circle_members where circle_id = cid and user_id = h), true);
  perform lock_circle(cid);
  perform run_draw(cid);

  select * into r1 from rounds where circle_id = cid and round_no = 1;
  select * into r2 from rounds where circle_id = cid and round_no = 2;
  assert r1.due_date = '2026-11-15' and r2.due_date = '2026-11-22', 'sahod dates follow the weekly schedule';
  assert (select count(*) from contributions where round_id = r1.id) = 14, 'round 1: 7 hulog x 2 members';
  assert (select count(*) from contributions where round_id = r2.id) = 14, 'round 2: 7 hulog x 2 members';
  assert (select min(due_date) from contributions where round_id = r1.id) = '2026-11-09';
  assert (select max(due_date) from contributions where round_id = r1.id) = '2026-11-15';
  assert (select min(due_date) from contributions where round_id = r2.id) = '2026-11-16';
  assert (select count(*) from contributions where round_id = r1.id and auto) = 7, 'recipient own hulog auto-confirmed';

  -- the recipient confirms one daily hulog; it is judged on time against its own date
  perform pg_temp.login((select user_id from circle_members where circle_id = cid and slot_group = r1.slot_group));
  perform review_contribution((select id from contributions where round_id = r1.id and not auto order by due_date limit 1), true);
  assert (select status from rounds where id = r1.id) = 'active', 'round stays active until every hulog is confirmed';

  perform pg_temp.logout();
  raise notice '✅ schedule + sahod + password assertions passed';
end $$;
