-- 0004: daily / custom ("every N days") schedules and join passwords.
-- Safe to run on top of 0001–0003.

-- ---------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------
alter table public.circles
  add column if not exists interval_days int check (interval_days is null or interval_days between 1 and 60),
  add column if not exists has_password  boolean not null default false;

alter table public.circles drop constraint if exists circles_frequency_check;
alter table public.circles add constraint circles_frequency_check
  check (frequency in ('daily','weekly','kinsenas','monthly','custom'));
alter table public.circles drop constraint if exists circles_custom_interval;
alter table public.circles add constraint circles_custom_interval
  check (frequency <> 'custom' or interval_days is not null);

-- Due date for round k (1-based), with daily and every-N-days support.
-- Mirrors roundDueDate() in src/lib/local.ts.
create or replace function public.round_due_date(freq text, start_date date, k int, every_days int)
returns date language plpgsql immutable as $$
begin
  if freq = 'daily' then
    return start_date + (k - 1);
  elsif freq = 'custom' then
    return start_date + (k - 1) * greatest(coalesce(every_days, 1), 1);
  end if;
  return public.round_due_date(freq, start_date, k);
end $$;

-- Same as 0001, but passes interval_days through.
create or replace function public._start_circle(p_circle uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare c circles; g uuid; k int := 0; rid uuid;
begin
  select * into c from circles where id = p_circle;
  foreach g in array p_order loop
    k := k + 1;
    update circle_members set slot_no = k where circle_id = p_circle and slot_group = g and status = 'approved';
    insert into rounds (circle_id, round_no, slot_group, due_date, status)
    values (p_circle, k, g, round_due_date(c.frequency, c.start_date, k, c.interval_days),
            case when k = 1 then 'active' else 'upcoming' end)
    returning id into rid;

    insert into contributions (round_id, circle_id, member_id, user_id, amount, status, auto, confirmed_at)
    select rid, p_circle, m.id, m.user_id, c.amount * m.share,
           case when m.slot_group = g then 'confirmed' else 'pending' end,
           m.slot_group = g,
           case when m.slot_group = g then now() end
    from circle_members m where m.circle_id = p_circle and m.status = 'approved';
  end loop;
  update circles set status = 'active' where id = p_circle;
end $$;
revoke execute on function public._start_circle(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Join passwords (bcrypt). RLS on with no policies: only SECURITY DEFINER
-- functions can read these tables.
-- ---------------------------------------------------------------------
create table if not exists public.circle_passwords (
  circle_id  uuid primary key references public.circles on delete cascade,
  hash       text not null,
  updated_at timestamptz not null default now()
);
alter table public.circle_passwords enable row level security;

create table if not exists public.join_attempts (
  id        bigserial primary key,
  circle_id uuid not null references public.circles on delete cascade,
  user_id   uuid not null,
  at        timestamptz not null default now()
);
create index if not exists join_attempts_idx on public.join_attempts (user_id, circle_id, at desc);
alter table public.join_attempts enable row level security;

create or replace function public._set_password(p_circle uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_password is null or length(trim(p_password)) = 0 then
    delete from circle_passwords where circle_id = p_circle;
    update circles set has_password = false where id = p_circle;
    return;
  end if;
  if length(p_password) < 4 then raise exception 'Password must be at least 4 characters'; end if;
  if length(p_password) > 64 then raise exception 'Password is too long'; end if;
  insert into circle_passwords (circle_id, hash) values (p_circle, crypt(p_password, gen_salt('bf')))
  on conflict (circle_id) do update set hash = excluded.hash, updated_at = now();
  update circles set has_password = true where id = p_circle;
end $$;
revoke execute on function public._set_password(uuid, text) from public, anon, authenticated;

-- Admin: set, change or remove (null/empty) the join password.
create or replace function public.set_circle_password(p_circle uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  perform _set_password(p_circle, p_password);
  perform log_activity(p_circle, 'password_changed', '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- create_circle: + interval_days, + password
-- ---------------------------------------------------------------------
drop function if exists public.create_circle(text, text, text, numeric, int, text, date, numeric, int, text, text);
create or replace function public.create_circle(
  p_name text, p_emoji text, p_color text, p_amount numeric, p_slots int,
  p_frequency text, p_start_date date, p_late_fee numeric, p_grace_days int,
  p_rules text, p_order_mode text, p_interval_days int default null, p_password text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_frequency = 'custom' and (p_interval_days is null or p_interval_days not between 1 and 60) then
    raise exception 'Choose how many days between payments (1 to 60)';
  end if;
  insert into circles (name, emoji, color, amount, slots, frequency, interval_days, start_date,
                       late_fee, grace_days, rules, order_mode, invite_code, created_by)
  values (trim(p_name), p_emoji, p_color, p_amount, p_slots, p_frequency,
          case when p_frequency = 'custom' then p_interval_days end, p_start_date,
          coalesce(p_late_fee, 0), coalesce(p_grace_days, 0), coalesce(p_rules, ''),
          coalesce(p_order_mode, 'draw'), gen_invite_code(), auth.uid())
  returning id into cid;

  insert into circle_members (circle_id, user_id, role, status, agreed_at)
  values (cid, auth.uid(), 'admin', 'approved', now());

  perform _set_password(cid, p_password);
  perform log_activity(cid, 'circle_created', jsonb_build_object('name', p_name));
  return cid;
end $$;

-- ---------------------------------------------------------------------
-- preview_circle: + has_password, + interval_days
-- ---------------------------------------------------------------------
drop function if exists public.preview_circle(text);
create or replace function public.preview_circle(p_code text)
returns table (
  id uuid, name text, emoji text, color text, amount numeric, slots int, frequency text,
  start_date date, late_fee numeric, grace_days int, rules text, status text,
  filled numeric, admin_name text, admin_tiwala int, my_status text,
  has_password boolean, interval_days int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, c.color, c.amount, c.slots, c.frequency, c.start_date,
         c.late_fee, c.grace_days, c.rules, c.status,
         coalesce((select sum(share) from circle_members m
                   where m.circle_id = c.id and m.status = 'approved'), 0),
         p.full_name, p.tiwala_score,
         (select m.status from circle_members m where m.circle_id = c.id and m.user_id = auth.uid()),
         c.has_password, c.interval_days
  from circles c
  join profiles p on p.id = c.created_by
  where c.invite_code = upper(trim(p_code));
$$;

-- ---------------------------------------------------------------------
-- request_join: + password check with throttling.
-- A wrong password returns NULL (instead of raising) so the failed attempt
-- is kept for throttling; the app shows "Incorrect password".
-- ---------------------------------------------------------------------
drop function if exists public.request_join(text, boolean);
create or replace function public.request_join(p_code text, p_hati boolean default false, p_password text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare c circles; mid uuid; h text; fails int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from circles where invite_code = upper(trim(p_code));
  if not found then raise exception 'No circle found with this invite code'; end if;
  if c.status <> 'forming' then raise exception 'This circle is no longer accepting members'; end if;

  select hash into h from circle_passwords where circle_id = c.id;
  if h is not null then
    select count(*) into fails from join_attempts
      where user_id = auth.uid() and circle_id = c.id and at > now() - interval '15 minutes';
    if fails >= 5 then raise exception 'Too many wrong passwords. Try again in 15 minutes.'; end if;
    if p_password is null or crypt(p_password, h) <> h then
      insert into join_attempts (circle_id, user_id) values (c.id, auth.uid());
      return null;
    end if;
  end if;

  insert into circle_members (circle_id, user_id, status, share, agreed_at)
  values (c.id, auth.uid(), 'pending', case when p_hati then 0.5 else 1 end, now())
  on conflict (circle_id, user_id) do update
    set status = 'pending', share = excluded.share, agreed_at = now(),
        slot_group = gen_random_uuid()
    where circle_members.status in ('rejected', 'left')
  returning id into mid;

  if mid is null then raise exception 'You already have a request for this circle'; end if;
  delete from join_attempts where user_id = auth.uid() and circle_id = c.id;
  perform log_activity(c.id, 'member_requested', jsonb_build_object('hati', p_hati));
  return mid;
end $$;
