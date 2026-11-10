-- 0022: start a finished paluwagan again with the same members.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000aa';
  b uuid := '00000000-0000-0000-0000-0000000000ba';
  c uuid := '00000000-0000-0000-0000-0000000000ca';
  d uuid := '00000000-0000-0000-0000-0000000000da';
  cid uuid; code text; nid uuid; start date := (now() at time zone 'Asia/Manila')::date + 7;
begin
  insert into auth.users (id, email) values (a,'aa@x'),(b,'ba@x'),(c,'ca@x'),(d,'da@x');
  perform pg_temp.login(a);
  cid := create_circle('Barkada', '💰', 'mango', 500, 50, 'weekly', '2030-06-03', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(d); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  perform lock_circle(cid);
  perform run_draw(cid);
  perform reveal_draw(cid);

  -- Not finished yet: can't ask
  begin perform request_repeat(cid, 'Barkada 2', start); assert false, 'only after it finishes';
  exception when raise_exception then null; end;

  perform advance_sahod(cid); perform advance_sahod(cid); perform advance_sahod(cid); perform advance_sahod(cid);
  assert (select status from circles where id = cid) = 'completed', 'finished';

  -- Only the admin asks
  perform pg_temp.login(b);
  begin perform request_repeat(cid, 'Barkada 2', start); assert false, 'member cannot ask';
  exception when raise_exception then null; end;

  perform pg_temp.login(a);
  perform request_repeat(cid, 'Barkada 2', start);
  assert (select repeat_waiting from circles where id = cid) = 3, 'three members to answer (admin is yes)';
  begin perform start_repeat(cid); assert false, 'wait for everyone';
  exception when raise_exception then null; end;

  perform pg_temp.login(b); perform answer_repeat(cid, true);
  perform pg_temp.login(c); perform answer_repeat(cid, true);
  perform pg_temp.login(d); perform answer_repeat(cid, false);
  perform pg_temp.login(b);
  begin perform start_repeat(cid); assert false, 'member cannot start';
  exception when raise_exception then null; end;

  perform pg_temp.login(a);
  assert (select repeat_waiting from circles where id = cid) = 0, 'everyone answered';
  nid := start_repeat(cid);
  assert (select status from circles where id = nid) = 'forming', 'new paluwagan ready to lock';
  assert (select name from circles where id = nid) = 'Barkada 2', 'new name';
  assert (select start_date from circles where id = nid) = start, 'new start date';
  assert (select count(*) from circle_members where circle_id = nid and status = 'approved') = 3, 'only the yes members';
  assert not exists (select 1 from circle_members where circle_id = nid and user_id = d), 'no-vote left out';
  assert (select role from circle_members where circle_id = nid and user_id = a) = 'admin', 'admin stays admin';
  assert (select repeat_circle from circles where id = cid) = nid, 'linked';
  perform lock_circle(nid);
  begin perform start_repeat(cid); assert false, 'only once';
  exception when raise_exception then null; end;

  raise notice '✅ repeat paluwagan assertions passed';
end $$;
