-- 0017: redo the draw before anyone pays.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a7';
  b uuid := '00000000-0000-0000-0000-0000000000b7';
  c uuid := '00000000-0000-0000-0000-0000000000c7';
  cid uuid; code text; h1 text; h2 text; k uuid;
begin
  insert into auth.users (id, email) values (a,'a7@x'),(b,'b7@x'),(c,'c7@x');
  perform pg_temp.login(a);
  cid := create_circle('Redo', '💰', 'mango', 500, 50, 'weekly', '2026-11-16', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  h1 := lock_circle(cid);
  perform run_draw(cid);
  perform reveal_draw(cid);

  -- Members can't redo it
  perform pg_temp.login(b);
  begin
    perform redo_draw(cid);
    assert false, 'only the admin can redo';
  exception when raise_exception then null; end;

  -- Admin redoes before anyone paid: back to locked, nothing left, new commitment
  perform pg_temp.login(a);
  h2 := redo_draw(cid);
  assert h2 <> h1, 'new seed fingerprint';
  assert (select status from circles where id = cid) = 'locked', 'ready for the draw again';
  assert (select count(*) from rounds where circle_id = cid) = 0, 'old rounds removed';
  assert (select count(*) from contributions where circle_id = cid) = 0, 'old hulog removed';
  assert (select revealed_at from circles where id = cid) is null, 'not revealed';
  assert (select seed from circles where id = cid) is null, 'new seed hidden until the draw';

  -- Draw again; once someone pays, no more redos
  perform run_draw(cid);
  perform reveal_draw(cid);
  assert (select count(*) from rounds where circle_id = cid) = 3, 'new rounds';
  perform pg_temp.login(b);
  select id into k from contributions where circle_id = cid and user_id = b and status = 'pending' order by due_date limit 1;
  perform submit_proof(k, cid || '/' || b || '/r.jpg');
  perform pg_temp.login(a);
  begin
    perform redo_draw(cid);
    assert false, 'no redo after a payment';
  exception when raise_exception then null; end;

  raise notice '✅ redo draw assertions passed';
end $$;
