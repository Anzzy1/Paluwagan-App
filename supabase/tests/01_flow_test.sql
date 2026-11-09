-- End-to-end test of the paluwagan lifecycle through the public RPCs, with RLS active.
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
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c';
  d uuid := '00000000-0000-0000-0000-00000000000d';
  e uuid := '00000000-0000-0000-0000-00000000000e';
  f uuid := '00000000-0000-0000-0000-00000000000f';
  cid uuid; code text; h text; s text; ord uuid[]; n int; x int;
  md uuid; me_ uuid; r record; k record; rec uuid; sc int;
  r3 rounds; r4 rounds; from_m uuid; to_m uuid; sid uuid; ok boolean;
begin
  -- signup trigger creates profiles
  insert into auth.users (id, email) values (a,'a@x'),(b,'b@x'),(c,'c@x'),(d,'d@x'),(e,'e@x'),(f,'f@x');
  assert (select count(*) from profiles) = 6, 'profiles auto-created';

  -- ---- admin creates circle
  perform pg_temp.login(a);
  update profiles set full_name = 'Ana' where id = a;
  cid := create_circle('Barkada', '💰', 'mango', 1000, 4, 'weekly', '2026-11-09', 50, 1, 'walang tubo', 'draw');
  select invite_code into code from circles where id = cid;
  assert length(code) = 6, 'invite code generated';
  begin
    update profiles set tiwala_score = 100 where id = a;
    assert false, 'tiwala_score must not be self-editable';
  exception when insufficient_privilege then null;
  end;

  -- ---- members request to join (D & E as hati)
  perform pg_temp.login(b); perform request_join(code, false);
  assert (select count(*) from circles) = 0, 'pending member cannot read circle';
  assert (select filled from preview_circle(code)) = 1, 'preview works for outsiders';
  perform pg_temp.login(c); perform request_join(lower(code), false);
  perform pg_temp.login(d); perform request_join(code, true);
  perform pg_temp.login(e); perform request_join(code, true);

  -- ---- admin approves + pairs hati
  perform pg_temp.login(a);
  for r in select id from circle_members where circle_id = cid and status = 'pending' loop
    perform review_member(r.id, true);
  end loop;
  begin perform lock_circle(cid); assert false, 'lock must fail with unpaired hati';
  exception when raise_exception then null; end;
  select id into md from circle_members where circle_id = cid and user_id = d;
  select id into me_ from circle_members where circle_id = cid and user_id = e;
  perform pair_hati(md, me_);

  -- non-admin cannot lock
  perform pg_temp.login(b);
  begin perform lock_circle(cid); assert false, 'non-admin lock must fail';
  exception when raise_exception then null; end;

  -- ---- COMMIT
  perform pg_temp.login(a);
  h := lock_circle(cid);
  perform pg_temp.login(b);
  assert (select seed from circles where id = cid) is null, 'seed hidden before draw';
  assert (select count(*) from circle_secrets) = 0, 'secrets unreadable';
  assert (select seed_hash from circles where id = cid) = h, 'hash published';

  -- ---- REVEAL
  perform pg_temp.login(a);
  ord := run_draw(cid);
  perform reveal_draw(cid); -- 0016: payments open once the order is revealed
  select seed into s from circles where id = cid;
  assert encode(extensions.digest(s, 'sha256'), 'hex') = h, 'seed matches commitment';
  assert ord = seeded_shuffle(s, (select array_agg(distinct slot_group) from circle_members
                                   where circle_id = cid and status = 'approved')), 'order reproducible';
  assert (select count(*) from rounds where circle_id = cid) = 4, '4 rounds';
  assert (select count(*) from contributions where circle_id = cid) = 20, '5 members x 4 rounds';
  assert (select count(*) from contributions where circle_id = cid and auto) = 0, 'everyone pays, the recipient included (0019)';
  assert (select amount from contributions where user_id = d limit 1) = 500, 'hati pays half';
  assert (select due_date from rounds where circle_id = cid and round_no = 3) = '2026-11-23', 'weekly due dates';
  assert (select status from circles where id = cid) = 'active';

  -- ---- Round 1: everyone pays, recipient confirms
  select * into r from rounds where circle_id = cid and round_no = 1;
  for k in select * from contributions where round_id = r.id and status = 'pending' loop
    perform pg_temp.login(k.user_id);
    perform submit_proof(k.id, cid || '/' || k.user_id || '/r.jpg', 'ref 1');
  end loop;
  select user_id into rec from circle_members where slot_group = r.slot_group limit 1;
  -- a non-recipient non-admin cannot confirm
  perform pg_temp.login(f);
  begin
    perform review_contribution((select id from contributions where round_id = r.id and status = 'submitted' limit 1), true);
    assert false, 'outsider confirm must fail';
  exception when raise_exception then null; end;
  -- 0019: the admin keeps the checklist and confirms every hulog (the recipient's too)
  perform pg_temp.login(a);
  for k in select * from contributions where round_id = r.id and status = 'submitted' loop
    perform review_contribution(k.id, true);
  end loop;
  -- 0018: the round waits for the admin to release the sahod
  assert (select status from rounds where id = r.id) = 'active', 'fully paid round waits for the admin';
  perform pg_temp.login(a);
  perform release_round(cid);
  assert (select status from rounds where id = r.id) = 'completed', 'round 1 completed';
  assert (select status from rounds where circle_id = cid and round_no = 2) = 'active', 'round 2 active';

  -- ---- Tiwala: on-time payers move above the 80 prior
  select tiwala_score into sc from profiles
    where id = (select user_id from contributions where round_id = r.id and not auto limit 1);
  assert sc > 80, 'tiwala increased (' || sc || ')';

  -- ---- Palit-Slot between round 3 and round 4
  select * into r3 from rounds where circle_id = cid and round_no = 3;
  select * into r4 from rounds where circle_id = cid and round_no = 4;
  select id into from_m from circle_members where slot_group = r3.slot_group order by joined_at limit 1;
  select id into to_m   from circle_members where slot_group = r4.slot_group order by joined_at limit 1;
  perform pg_temp.login((select user_id from circle_members where id = from_m));
  sid := request_swap(cid, to_m);
  perform pg_temp.login((select user_id from circle_members where id = to_m));
  perform respond_swap(sid, 'accept');
  perform pg_temp.login(a);
  perform respond_swap(sid, 'approve');
  assert (select slot_group from rounds where id = r3.id) = r4.slot_group, 'round 3 now belongs to old round-4 slot';
  assert (select slot_group from rounds where id = r4.id) = r3.slot_group, 'round 4 now belongs to old round-3 slot';
  assert not exists (select 1 from contributions where circle_id = cid and auto), 'no auto-confirmed shares after a swap';

  -- ---- Outsider sees nothing
  perform pg_temp.login(f);
  assert (select count(*) from contributions) = 0, 'outsider: no contributions';
  assert (select count(*) from circle_members) = 0, 'outsider: no members';
  assert (select count(*) from activity) = 0, 'outsider: no activity';
  assert (select count(*) from profiles) = 1, 'outsider sees only self';

  -- ---- Storage policies
  perform pg_temp.login(b);
  insert into storage.objects (bucket_id, name) values ('receipts', cid || '/' || b || '/ok.jpg');
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', cid || '/' || a || '/spoof.jpg');
    assert false, 'cannot upload into another user folder';
  exception when insufficient_privilege then null; end;
  perform pg_temp.login(f);
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', cid || '/' || f || '/x.jpg');
    assert false, 'outsider cannot upload';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from storage.objects) = 0, 'outsider cannot read receipts';

  -- ---- Kinsenas schedule + fixed shuffle vector shared with scripts/test-draw.mjs
  perform pg_temp.logout();
  assert round_due_date('kinsenas', '2026-11-20', 1) = '2026-11-30';
  assert round_due_date('kinsenas', '2026-11-20', 2) = '2026-12-15';
  assert round_due_date('kinsenas', '2026-11-20', 3) = '2026-12-31';
  assert round_due_date('kinsenas', '2027-02-01', 2) = '2027-02-28';
  assert round_due_date('monthly', '2026-01-31', 2) = '2026-02-28';
  assert (select string_agg(substr(u::text, 8, 1), '' order by ordinality)
          from unnest(seeded_shuffle('paluwagan', array[
            '00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000000',
            '00000002-0000-0000-0000-000000000000', '00000003-0000-0000-0000-000000000000',
            '00000004-0000-0000-0000-000000000000']::uuid[])) with ordinality u) = '23104',
    'SQL shuffle matches the JS implementation';

  select count(*) into n from activity where circle_id = cid;
  raise notice 'activity rows: %', n;
  raise notice '✅ all paluwagan flow assertions passed';
end $$;
