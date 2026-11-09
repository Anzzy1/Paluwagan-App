-- 0009: group chat permissions.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a2'; -- admin
  b uuid := '00000000-0000-0000-0000-0000000000b2'; -- member
  p uuid := '00000000-0000-0000-0000-0000000000c2'; -- pending request
  o uuid := '00000000-0000-0000-0000-0000000000d2'; -- outsider
  cid uuid; code text; mid uuid; n int;
begin
  insert into auth.users (id, email) values (a,'a2@x'),(b,'b2@x'),(p,'p2@x'),(o,'o2@x');
  perform pg_temp.login(a);
  cid := create_circle('Chat', '💰', 'mango', 500, 3, 'weekly', '2026-11-16', 0, 0, '', 'draw');
  select invite_code into code from circles where id = cid;
  perform pg_temp.login(b); perform request_join(code, false);
  perform pg_temp.login(a);
  perform review_member(id, true) from circle_members where circle_id = cid and user_id = b;
  perform pg_temp.login(p); perform request_join(code, false);

  -- Members can send and read
  perform pg_temp.login(b);
  insert into circle_messages (circle_id, body) values (cid, 'Hello group!') returning id into mid;
  assert (select user_id from circle_messages where id = mid) = b, 'sender defaults to me';
  perform pg_temp.login(a);
  insert into circle_messages (circle_id, body) values (cid, 'Welcome!');
  assert (select count(*) from circle_messages where circle_id = cid) = 2, 'admin reads both';

  -- Can't post as someone else
  perform pg_temp.login(b);
  begin
    insert into circle_messages (circle_id, user_id, body) values (cid, a, 'spoof');
    assert false, 'must not post as another user';
  exception when insufficient_privilege then null; end;
  -- Empty messages are refused
  begin
    insert into circle_messages (circle_id, body) values (cid, '   ');
    assert false, 'empty message refused';
  exception when check_violation then null; end;
  -- No editing
  begin
    update circle_messages set body = 'edited' where id = mid;
    assert false, 'messages cannot be edited';
  exception when insufficient_privilege then null; end;

  -- Pending requests and outsiders see nothing and can't post
  foreach mid in array array[p, o] loop
    perform pg_temp.login(mid);
    assert (select count(*) from circle_messages) = 0, 'non-members read nothing';
    begin
      insert into circle_messages (circle_id, body) values (cid, 'let me in');
      assert false, 'non-members cannot post';
    exception when insufficient_privilege then null; end;
  end loop;

  -- A member can't delete someone else's message (silently affects 0 rows); the admin can.
  perform pg_temp.login(b);
  delete from circle_messages where user_id = a;
  get diagnostics n = row_count;
  assert n = 0, 'member cannot delete others';
  perform pg_temp.login(a);
  delete from circle_messages where user_id = b;
  get diagnostics n = row_count;
  assert n = 1, 'admin can remove a message';

  raise notice '✅ chat assertions passed';
end $$;
