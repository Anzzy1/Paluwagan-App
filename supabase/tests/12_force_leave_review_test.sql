-- 0024/0025: leftover hulog split on force leave, admin review, last member out deletes.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000ac';
  b uuid := '00000000-0000-0000-0000-0000000000bc';
  c uuid := '00000000-0000-0000-0000-0000000000cc';
  d uuid := '00000000-0000-0000-0000-0000000000dc';
  cid uuid; cid2 uuid; code text; first_group uuid; leaver uuid; lm uuid; k uuid;
begin
  insert into auth.users (id, email) values (a,'ac@x'),(b,'bc@x'),(c,'cc@x'),(d,'dc@x');
  perform pg_temp.login(a);
  cid := create_circle('Split', '💰', 'mango', 500, 50, 'weekly', '2030-06-03', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(c); perform request_join(code, false);
  perform pg_temp.login(d); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and status = 'pending';
  perform lock_circle(cid);
  perform run_draw(cid);
  perform reveal_draw(cid);

  -- A member who isn't the first recipient pays one hulog, then leaves without a refund.
  select slot_group into first_group from rounds where circle_id = cid and round_no = 1;
  select id, user_id into lm, leaver from circle_members
   where circle_id = cid and status = 'approved' and role = 'member' and slot_group <> first_group limit 1;
  select id into k from contributions where member_id = lm order by due_date limit 1;
  execute 'reset role';
  update contributions set status = 'confirmed', on_time = true where id = k;  -- as if confirmed
  perform pg_temp.login(leaver);
  perform force_leave(cid);
  assert (select left_forced from circle_members where id = lm), 'marked as force leave';
  assert (select left_reviewed_at from circle_members where id = lm) is null, 'waiting for review';
  assert (select amount from fund_adjustments where circle_id = cid and kind = 'split') = 500, 'all of it split';
  assert (select split_count from fund_adjustments where circle_id = cid and kind = 'split') = 3, 'among the 3 who stay';

  -- Admin changes the split to 300
  perform pg_temp.login(a);
  begin perform review_left(lm, 900); assert false, 'cannot split more than paid';
  exception when raise_exception then null; end;
  perform review_left(lm, 300);
  assert (select amount from fund_adjustments where circle_id = cid and kind = 'split') = 300, 'split changed';
  assert (select left_reviewed_at from circle_members where id = lm) is not null, 'reviewed';
  begin perform review_left(lm, 300); assert false, 'only once';
  exception when raise_exception then null; end;

  -- The last member out deletes a forming paluwagan
  cid2 := create_circle('Solo', '💰', 'mango', 500, 5, 'weekly', '2030-06-03', 0, 0, '', 'draw');
  perform force_leave(cid2);
  assert (select deleted_at from circles where id = cid2) is not null, 'deleted when the last one leaves';
  assert (select status from circle_members where circle_id = cid2 and user_id = a) = 'approved', 'admin keeps it in history';

  raise notice '✅ force leave review assertions passed';
end $$;
