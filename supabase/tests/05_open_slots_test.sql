-- 0010: slots follow who joins while forming; lock needs at least 3.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a3';
  b uuid := '00000000-0000-0000-0000-0000000000b3';
  c uuid := '00000000-0000-0000-0000-0000000000c3';
  d uuid := '00000000-0000-0000-0000-0000000000d3';
  cid uuid; code text;
begin
  insert into auth.users (id, email) values (a,'a3@x'),(b,'b3@x'),(c,'c3@x'),(d,'d3@x');
  perform pg_temp.login(a);
  cid := create_circle('Open', '💰', 'mango', 500, 50, 'weekly', '2026-11-16', 0, 0, '', 'draw');
  assert (select slots from circles where id = cid) = 1, 'admin alone = 1 slot';
  select invite_code into code from circles where id = cid;

  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(a);
  assert (select slots from circles where id = cid) = 1, 'pending requests don’t count';
  perform review_member(id, true) from circle_members where circle_id = cid and user_id = b;
  assert (select slots from circles where id = cid) = 2, 'approved member counts';
  assert (select joined from preview_circle(code)) = 2, 'preview counts people';

  begin
    perform lock_circle(cid);
    assert false, 'lock needs at least 3';
  exception when raise_exception then null; end;

  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and user_id = c;
  perform lock_circle(cid);
  assert (select slots from circles where id = cid) = 3, 'locked with 3 slots';

  -- Unlock reopens and recounts; another member can join
  perform unlock_circle(cid);
  perform pg_temp.login(d); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and user_id = d;
  assert (select slots from circles where id = cid) = 4, 'reopened paluwagan grows to 4';
  perform lock_circle(cid);
  perform run_draw(cid);
  assert (select count(*) from rounds where circle_id = cid) = 4, '4 payout rounds';
  assert (select slots from circles where id = cid) = 4, 'slots fixed after start';

  raise notice '✅ open slots assertions passed';
end $$;
