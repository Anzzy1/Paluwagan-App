-- 0015: the admin's draw game is saved with the draw so members watch the same one.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a6';
  b uuid := '00000000-0000-0000-0000-0000000000b6';
  c uuid := '00000000-0000-0000-0000-0000000000c6';
  cid uuid; code text; ord uuid[];
begin
  insert into auth.users (id, email) values (a,'a6@x'),(b,'b6@x'),(c,'c6@x');
  perform pg_temp.login(a);
  cid := create_circle('Watch', '💰', 'mango', 500, 50, 'weekly', '2026-11-16', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  perform lock_circle(cid);

  perform pg_temp.login(b);
  begin
    perform run_draw_with_style(cid, 'claw');
    assert false, 'only the admin runs the draw';
  exception when raise_exception then null; end;

  perform pg_temp.login(a);
  begin
    perform run_draw_with_style(cid, 'horse');
    assert false, 'unknown games are refused';
  exception when raise_exception then null; end;

  ord := run_draw_with_style(cid, 'claw');
  assert array_length(ord, 1) = 3, 'draw ran';
  perform pg_temp.login(b);
  assert (select draw_style from circles where id = cid) = 'claw', 'members see the admin’s game';
  assert (select status from circles where id = cid) = 'active', 'paluwagan started';

  -- 0016: nobody pays before the order is revealed
  begin
    perform submit_proof((select id from contributions where circle_id = cid and user_id = b and status = 'pending' limit 1), 'x/y.jpg');
    assert false, 'no paying before the reveal';
  exception when raise_exception then null; end;
  begin
    perform reveal_draw(cid);
    assert false, 'only the admin reveals';
  exception when raise_exception then null; end;
  perform pg_temp.login(a);
  perform reveal_draw(cid);
  perform pg_temp.login(b);
  perform submit_proof((select id from contributions where circle_id = cid and user_id = b and status = 'pending' limit 1), cid || '/' || b || '/r.jpg');
  assert exists (select 1 from contributions where circle_id = cid and user_id = b and status = 'submitted'), 'paying works after the reveal';

  -- 0019: the admin marks a hulog paid without a receipt (cash handed over)
  perform pg_temp.login(a);
  perform review_contribution((select id from contributions where circle_id = cid and user_id = c and status = 'pending' order by due_date limit 1), true);
  assert exists (select 1 from contributions where circle_id = cid and user_id = c and status = 'confirmed' and proof_path is null), 'marked paid without a receipt';

  raise notice '✅ draw style assertions passed';
end $$;
