-- =====================================================================
-- Paluwagan App — initial schema
-- Run this whole file in the Supabase SQL editor (or `supabase db push`).
-- All writes that need business rules go through SECURITY DEFINER RPCs;
-- tables are read-only to clients except where a policy says otherwise.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     text not null default '',
  avatar_emoji  text not null default '🙂',
  phone         text,
  gcash_number  text,
  tiwala_score  int  not null default 80,
  push_token    text,
  created_at    timestamptz not null default now()
);

create table public.circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  emoji       text not null default '💰',
  color       text not null default 'mango',
  amount      numeric(12,2) not null check (amount > 0),
  slots       int  not null check (slots between 2 and 50),
  frequency   text not null check (frequency in ('weekly','kinsenas','monthly')),
  start_date  date not null,
  late_fee    numeric(12,2) not null default 0 check (late_fee >= 0),
  grace_days  int  not null default 0 check (grace_days between 0 and 30),
  rules       text not null default '',
  order_mode  text not null default 'draw' check (order_mode in ('draw','manual')),
  status      text not null default 'forming'
              check (status in ('forming','locked','active','completed')),
  invite_code text not null unique,
  seed_hash   text,             -- published at lock (commit)
  seed        text,             -- revealed at draw
  draw_order  uuid[],           -- original slot_group order produced by the draw
  drawn_at    timestamptz,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- The seed lives here between lock and draw. RLS on, no policies => nobody
-- but SECURITY DEFINER functions can read it.
create table public.circle_secrets (
  circle_id uuid primary key references public.circles on delete cascade,
  seed      text not null
);

create table public.circle_members (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  role        text not null default 'member' check (role in ('admin','member')),
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','left')),
  share       numeric(3,2) not null default 1 check (share in (1, 0.5)),
  slot_group  uuid not null default gen_random_uuid(),  -- hati partners share one
  slot_no     int,
  agreed_at   timestamptz,                               -- digital kasunduan
  joined_at   timestamptz not null default now(),
  unique (circle_id, user_id)
);
create index on public.circle_members (user_id);
create index on public.circle_members (circle_id, slot_group);

create table public.rounds (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles on delete cascade,
  round_no      int  not null,
  slot_group    uuid not null,
  due_date      date not null,
  status        text not null default 'upcoming'
                check (status in ('upcoming','active','completed')),
  completed_at  timestamptz,
  unique (circle_id, round_no)
);

create table public.contributions (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds on delete cascade,
  circle_id     uuid not null references public.circles on delete cascade,
  member_id     uuid not null references public.circle_members on delete cascade,
  user_id       uuid not null references public.profiles on delete cascade,
  amount        numeric(12,2) not null,
  status        text not null default 'pending'
                check (status in ('pending','submitted','confirmed','rejected')),
  auto          boolean not null default false, -- recipient's own share, auto-confirmed
  proof_path    text,
  note          text,
  reject_reason text,
  submitted_at  timestamptz,
  confirmed_at  timestamptz,
  confirmed_by  uuid references public.profiles(id),
  on_time       boolean,
  unique (round_id, member_id)
);
create index on public.contributions (user_id, status);
create index on public.contributions (circle_id);

create table public.swap_requests (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles on delete cascade,
  from_member uuid not null references public.circle_members on delete cascade,
  to_member   uuid not null references public.circle_members on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','accepted','declined','approved','rejected','cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  circle_id  uuid references public.circles on delete set null,
  title      text not null check (char_length(title) between 1 and 60),
  target     numeric(12,2) not null check (target > 0),
  emoji      text not null default '🎯',
  created_at timestamptz not null default now()
);

create table public.activity (
  id         bigserial primary key,
  circle_id  uuid not null references public.circles on delete cascade,
  actor      uuid references public.profiles(id),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity (circle_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members
                 where circle_id = c and user_id = auth.uid() and status = 'approved');
$$;

create or replace function public.is_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members
                 where circle_id = c and user_id = auth.uid()
                   and status = 'approved' and role = 'admin');
$$;

-- can the current user see this profile? (self, or any shared circle incl. pending requests)
create or replace function public.can_see_profile(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid() or exists (
    select 1 from circle_members me
    join circle_members other on other.circle_id = me.circle_id
    where me.user_id = auth.uid() and me.status = 'approved' and other.user_id = p
  ) or exists (
    -- someone who requested to join can see the circle's admin
    select 1 from circle_members me
    join circle_members adm on adm.circle_id = me.circle_id and adm.role = 'admin'
    where me.user_id = auth.uid() and adm.user_id = p
  );
$$;

create or replace function public.log_activity(c uuid, t text, p jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into activity (circle_id, actor, type, payload) values (c, auth.uid(), t, p);
$$;

create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from circles where invite_code = code);
  end loop;
  return code;
end $$;

-- Deterministic due date for round k (1-based)
create or replace function public.round_due_date(freq text, start_date date, k int) returns date
language plpgsql immutable as $$
declare
  d date; m date; n int := 0;
begin
  if freq = 'weekly' then
    return start_date + (k - 1) * 7;
  elsif freq = 'monthly' then
    return (start_date + make_interval(months => k - 1))::date;
  else -- kinsenas: every 15th and last day of the month, on/after start_date
    m := date_trunc('month', start_date)::date;
    loop
      d := m + 14;
      if d >= start_date then n := n + 1; if n = k then return d; end if; end if;
      d := (m + interval '1 month - 1 day')::date;
      if d >= start_date then n := n + 1; if n = k then return d; end if; end if;
      m := (m + interval '1 month')::date;
    end loop;
  end if;
end $$;

-- Provably-fair shuffle. MUST stay identical to src/lib/draw.ts:
--   items sorted ascending; for i = n-1 .. 1:
--   j = int(first 7 hex chars of sha256(seed || ':' || i)) mod (i + 1); swap(i, j)
create or replace function public.seeded_shuffle(seed text, items uuid[]) returns uuid[]
language plpgsql immutable set search_path = public, extensions as $$
declare
  arr uuid[];
  n int;
  j int;
  tmp uuid;
begin
  select array_agg(x order by x) into arr from unnest(items) x;
  n := coalesce(array_length(arr, 1), 0);
  for i in reverse (n - 1)..1 loop
    j := (('x' || substr(encode(digest(seed || ':' || i, 'sha256'), 'hex'), 1, 7))::bit(28)::int) % (i + 1);
    tmp := arr[i + 1]; arr[i + 1] := arr[j + 1]; arr[j + 1] := tmp;
  end loop;
  return arr;
end $$;

create or replace function public.recompute_tiwala(u uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total int; good int;
begin
  select count(*), count(*) filter (where on_time)
    into total, good
    from contributions where user_id = u and status = 'confirmed' and not auto and on_time is not null;
  -- Bayesian prior: new users start at 80
  update profiles set tiwala_score = round(100.0 * (good + 4) / (total + 5)) where id = u;
end $$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.circles        enable row level security;
alter table public.circle_secrets enable row level security;
alter table public.circle_members enable row level security;
alter table public.rounds         enable row level security;
alter table public.contributions  enable row level security;
alter table public.swap_requests  enable row level security;
alter table public.goals          enable row level security;
alter table public.activity       enable row level security;

create policy "profiles: read shared" on public.profiles for select to authenticated
  using (public.can_see_profile(id));
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "circles: members read" on public.circles for select to authenticated
  using (public.is_member(id));

create policy "members: read" on public.circle_members for select to authenticated
  using (public.is_member(circle_id) or user_id = auth.uid());

create policy "rounds: members read" on public.rounds for select to authenticated
  using (public.is_member(circle_id));

create policy "contributions: members read" on public.contributions for select to authenticated
  using (public.is_member(circle_id));

create policy "swaps: members read" on public.swap_requests for select to authenticated
  using (public.is_member(circle_id));

create policy "goals: own" on public.goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "activity: members read" on public.activity for select to authenticated
  using (public.is_member(circle_id));

-- tiwala_score must not be self-editable
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_emoji, phone, gcash_number, push_token) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

create or replace function public.create_circle(
  p_name text, p_emoji text, p_color text, p_amount numeric, p_slots int,
  p_frequency text, p_start_date date, p_late_fee numeric, p_grace_days int,
  p_rules text, p_order_mode text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into circles (name, emoji, color, amount, slots, frequency, start_date,
                       late_fee, grace_days, rules, order_mode, invite_code, created_by)
  values (trim(p_name), p_emoji, p_color, p_amount, p_slots, p_frequency, p_start_date,
          coalesce(p_late_fee, 0), coalesce(p_grace_days, 0), coalesce(p_rules, ''),
          coalesce(p_order_mode, 'draw'), gen_invite_code(), auth.uid())
  returning id into cid;

  insert into circle_members (circle_id, user_id, role, status, agreed_at)
  values (cid, auth.uid(), 'admin', 'approved', now());

  perform log_activity(cid, 'circle_created', jsonb_build_object('name', p_name));
  return cid;
end $$;

create or replace function public.preview_circle(p_code text)
returns table (
  id uuid, name text, emoji text, color text, amount numeric, slots int, frequency text,
  start_date date, late_fee numeric, grace_days int, rules text, status text,
  filled numeric, admin_name text, admin_tiwala int, my_status text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, c.color, c.amount, c.slots, c.frequency, c.start_date,
         c.late_fee, c.grace_days, c.rules, c.status,
         coalesce((select sum(share) from circle_members m
                   where m.circle_id = c.id and m.status = 'approved'), 0),
         p.full_name, p.tiwala_score,
         (select m.status from circle_members m where m.circle_id = c.id and m.user_id = auth.uid())
  from circles c
  join profiles p on p.id = c.created_by
  where c.invite_code = upper(trim(p_code));
$$;

create or replace function public.request_join(p_code text, p_hati boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare c circles; mid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from circles where invite_code = upper(trim(p_code));
  if not found then raise exception 'Walang circle na may ganitong code'; end if;
  if c.status <> 'forming' then raise exception 'Sarado na ang circle na ito'; end if;

  insert into circle_members (circle_id, user_id, status, share, agreed_at)
  values (c.id, auth.uid(), 'pending', case when p_hati then 0.5 else 1 end, now())
  on conflict (circle_id, user_id) do update
    set status = 'pending', share = excluded.share, agreed_at = now(),
        slot_group = gen_random_uuid()
    where circle_members.status in ('rejected', 'left')
  returning id into mid;

  if mid is null then raise exception 'May request ka na sa circle na ito'; end if;
  perform log_activity(c.id, 'member_requested', jsonb_build_object('hati', p_hati));
  return mid;
end $$;

create or replace function public.review_member(p_member uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members; c circles; filled numeric;
begin
  select * into m from circle_members where id = p_member for update;
  if not found or not is_admin(m.circle_id) then raise exception 'Admin only'; end if;
  select * into c from circles where id = m.circle_id;
  if c.status <> 'forming' then raise exception 'Circle is no longer forming'; end if;
  if m.status <> 'pending' then raise exception 'Request already handled'; end if;

  if p_approve then
    select coalesce(sum(share), 0) into filled from circle_members
      where circle_id = m.circle_id and status = 'approved';
    if filled + m.share > c.slots then raise exception 'Puno na ang mga slot'; end if;
    update circle_members set status = 'approved' where id = p_member;
  else
    update circle_members set status = 'rejected' where id = p_member;
  end if;
  perform log_activity(m.circle_id, case when p_approve then 'member_approved' else 'member_rejected' end,
                       jsonb_build_object('user_id', m.user_id));
end $$;

-- Pair two half-slot members into one slot (Hati-Slot)
create or replace function public.pair_hati(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a circle_members; b circle_members;
begin
  select * into a from circle_members where id = p_a;
  select * into b from circle_members where id = p_b;
  if a.id is null or b.id is null or a.circle_id <> b.circle_id or a.id = b.id then
    raise exception 'Invalid pair';
  end if;
  if not is_admin(a.circle_id) then raise exception 'Admin only'; end if;
  if (select status from circles where id = a.circle_id) <> 'forming' then
    raise exception 'Circle is no longer forming';
  end if;
  if a.share <> 0.5 or b.share <> 0.5 or a.status <> 'approved' or b.status <> 'approved' then
    raise exception 'Both must be approved half-slot members';
  end if;
  if (select count(*) from circle_members where slot_group = a.slot_group and status = 'approved') > 1
     or (select count(*) from circle_members where slot_group = b.slot_group and status = 'approved') > 1 then
    raise exception 'One of them already has a partner';
  end if;
  update circle_members set slot_group = a.slot_group where id = b.id;
  perform log_activity(a.circle_id, 'hati_paired',
                       jsonb_build_object('a', a.user_id, 'b', b.user_id));
end $$;

create or replace function public.leave_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m circle_members;
begin
  select * into m from circle_members where circle_id = p_circle and user_id = auth.uid();
  if not found then raise exception 'Not a member'; end if;
  if m.role = 'admin' then raise exception 'Admin cannot leave'; end if;
  if (select status from circles where id = p_circle) <> 'forming' then
    raise exception 'Hindi na pwedeng umalis — nagsimula na ang circle';
  end if;
  update circle_members set status = 'left', slot_group = gen_random_uuid() where id = m.id;
  -- un-pair partner, if any
  update circle_members set slot_group = gen_random_uuid()
    where circle_id = p_circle and slot_group = m.slot_group and id <> m.id;
  perform log_activity(p_circle, 'member_left');
end $$;

-- Validates the roster and returns the distinct slot groups.
create or replace function public._slot_groups(p_circle uuid) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare c circles; groups uuid[]; bad int;
begin
  select * into c from circles where id = p_circle;
  select array_agg(distinct slot_group) into groups
    from circle_members where circle_id = p_circle and status = 'approved';
  select count(*) into bad from (
    select slot_group from circle_members
    where circle_id = p_circle and status = 'approved'
    group by slot_group having sum(share) <> 1
  ) x;
  if bad > 0 then raise exception 'May hati-slot member na wala pang partner'; end if;
  if coalesce(array_length(groups, 1), 0) <> c.slots then
    raise exception 'Kailangan ng % na slots, % pa lang ang puno', c.slots, coalesce(array_length(groups, 1), 0);
  end if;
  return groups;
end $$;

-- COMMIT step: generate a secret seed and publish only its hash.
create or replace function public.lock_circle(p_circle uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c circles; s text; h text;
begin
  select * into c from circles where id = p_circle for update;
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if c.status <> 'forming' then raise exception 'Circle is not forming'; end if;
  perform _slot_groups(p_circle);

  s := encode(gen_random_bytes(32), 'hex');
  h := encode(digest(s, 'sha256'), 'hex');
  insert into circle_secrets (circle_id, seed) values (p_circle, s)
    on conflict (circle_id) do update set seed = excluded.seed;
  update circles set status = 'locked', seed_hash = h where id = p_circle;
  -- pending requests can no longer get in
  update circle_members set status = 'rejected' where circle_id = p_circle and status = 'pending';
  perform log_activity(p_circle, 'circle_locked', jsonb_build_object('seed_hash', h));
  return h;
end $$;

create or replace function public.unlock_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if (select status from circles where id = p_circle) <> 'locked' then
    raise exception 'Circle is not locked';
  end if;
  delete from circle_secrets where circle_id = p_circle;
  update circles set status = 'forming', seed_hash = null where id = p_circle;
  perform log_activity(p_circle, 'circle_unlocked');
end $$;

-- Internal: build rounds + contributions from an ordered list of slot groups.
create or replace function public._start_circle(p_circle uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare c circles; g uuid; k int := 0; rid uuid;
begin
  select * into c from circles where id = p_circle;
  foreach g in array p_order loop
    k := k + 1;
    update circle_members set slot_no = k where circle_id = p_circle and slot_group = g and status = 'approved';
    insert into rounds (circle_id, round_no, slot_group, due_date, status)
    values (p_circle, k, g, round_due_date(c.frequency, c.start_date, k),
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
revoke execute on function public._slot_groups(uuid) from public, anon, authenticated;

-- REVEAL step: publish the seed and derive the order from it.
create or replace function public.run_draw(p_circle uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare c circles; s text; ord uuid[];
begin
  select * into c from circles where id = p_circle for update;
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if c.status <> 'locked' or c.order_mode <> 'draw' then raise exception 'Circle not ready for draw'; end if;
  select seed into s from circle_secrets where circle_id = p_circle;

  ord := seeded_shuffle(s, _slot_groups(p_circle));
  update circles set seed = s, draw_order = ord, drawn_at = now() where id = p_circle;
  delete from circle_secrets where circle_id = p_circle;
  perform _start_circle(p_circle, ord);
  perform log_activity(p_circle, 'draw_completed', jsonb_build_object('seed', s));
  return ord;
end $$;

-- Manual ordering by admin (order_mode = 'manual')
create or replace function public.set_manual_order(p_circle uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare c circles; groups uuid[];
begin
  select * into c from circles where id = p_circle for update;
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if c.status <> 'locked' or c.order_mode <> 'manual' then raise exception 'Circle not ready'; end if;
  groups := _slot_groups(p_circle);
  if array_length(p_order, 1) <> array_length(groups, 1)
     or exists (select unnest(groups) except select unnest(p_order)) then
    raise exception 'Order must contain every slot exactly once';
  end if;
  update circles set draw_order = p_order, drawn_at = now() where id = p_circle;
  delete from circle_secrets where circle_id = p_circle;
  perform _start_circle(p_circle, p_order);
  perform log_activity(p_circle, 'order_set');
end $$;

create or replace function public.submit_proof(p_contribution uuid, p_proof_path text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found or k.user_id <> auth.uid() then raise exception 'Not your contribution'; end if;
  if k.status not in ('pending', 'rejected') then raise exception 'Already submitted'; end if;
  update contributions set status = 'submitted', proof_path = p_proof_path, note = p_note,
         submitted_at = now(), reject_reason = null
   where id = p_contribution;
  perform log_activity(k.circle_id, 'proof_submitted',
    jsonb_build_object('round_id', k.round_id, 'amount', k.amount));
end $$;

-- Recipient (or admin) confirms money arrived — the second signature.
create or replace function public.review_contribution(p_contribution uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contributions; r rounds; c circles; is_recipient boolean; nxt uuid;
begin
  select * into k from contributions where id = p_contribution for update;
  if not found then raise exception 'Not found'; end if;
  select * into r from rounds where id = k.round_id;
  select * into c from circles where id = k.circle_id;
  is_recipient := exists (select 1 from circle_members where slot_group = r.slot_group
                          and user_id = auth.uid() and status = 'approved');
  if not (is_recipient or is_admin(k.circle_id)) then raise exception 'Recipient or admin only'; end if;
  if k.status not in ('submitted', 'pending') then raise exception 'Nothing to review'; end if;

  if p_approve then
    update contributions set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
           on_time = coalesce(submitted_at, now())::date <= r.due_date + c.grace_days
     where id = p_contribution;
    perform recompute_tiwala(k.user_id);
    perform log_activity(k.circle_id, 'payment_confirmed',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'amount', k.amount));

    if not exists (select 1 from contributions where round_id = r.id and status <> 'confirmed') then
      update rounds set status = 'completed', completed_at = now() where id = r.id;
      perform log_activity(k.circle_id, 'round_completed', jsonb_build_object('round_no', r.round_no));
      select id into nxt from rounds where circle_id = r.circle_id and status = 'upcoming'
        order by round_no limit 1;
      if nxt is null then
        if not exists (select 1 from rounds where circle_id = r.circle_id and status <> 'completed') then
          update circles set status = 'completed' where id = r.circle_id;
          perform log_activity(k.circle_id, 'circle_completed');
        end if;
      elsif not exists (select 1 from rounds where circle_id = r.circle_id and status = 'active') then
        update rounds set status = 'active' where id = nxt;
      end if;
    end if;
  else
    update contributions set status = 'rejected', reject_reason = p_reason where id = p_contribution;
    perform log_activity(k.circle_id, 'payment_rejected',
      jsonb_build_object('round_no', r.round_no, 'payer', k.user_id, 'reason', p_reason));
  end if;
end $$;

-- ---- Palit-Slot ----------------------------------------------------

create or replace function public.request_swap(p_circle uuid, p_to_member uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me circle_members; them circle_members; sid uuid;
begin
  select * into me from circle_members where circle_id = p_circle and user_id = auth.uid() and status = 'approved';
  select * into them from circle_members where id = p_to_member and circle_id = p_circle and status = 'approved';
  if me.id is null or them.id is null then raise exception 'Invalid members'; end if;
  if me.slot_group = them.slot_group then raise exception 'Same slot'; end if;
  if exists (select 1 from rounds where circle_id = p_circle
             and slot_group in (me.slot_group, them.slot_group) and status <> 'upcoming') then
    raise exception 'Pwede lang ipalit ang mga slot na hindi pa nagsisimula';
  end if;
  if exists (select 1 from swap_requests where circle_id = p_circle and status in ('pending','accepted')
             and (from_member in (me.id, them.id) or to_member in (me.id, them.id))) then
    raise exception 'May pending na palit-slot na';
  end if;
  insert into swap_requests (circle_id, from_member, to_member) values (p_circle, me.id, them.id)
    returning id into sid;
  perform log_activity(p_circle, 'swap_requested', jsonb_build_object('to', them.user_id));
  return sid;
end $$;

create or replace function public._execute_swap(s swap_requests)
returns void language plpgsql security definer set search_path = public as $$
declare ga uuid; gb uuid; ra rounds; rb rounds;
begin
  select slot_group into ga from circle_members where id = s.from_member;
  select slot_group into gb from circle_members where id = s.to_member;
  select * into ra from rounds where circle_id = s.circle_id and slot_group = ga;
  select * into rb from rounds where circle_id = s.circle_id and slot_group = gb;
  if ra.status <> 'upcoming' or rb.status <> 'upcoming' then raise exception 'Slots already started'; end if;

  update rounds set slot_group = gb where id = ra.id;
  update rounds set slot_group = ga where id = rb.id;
  update circle_members set slot_no = rb.round_no where circle_id = s.circle_id and slot_group = ga;
  update circle_members set slot_no = ra.round_no where circle_id = s.circle_id and slot_group = gb;

  -- move the auto-confirmed "own share" to the new recipient
  update contributions k set status = 'pending', auto = false, confirmed_at = null
   where k.round_id in (ra.id, rb.id) and k.auto;
  update contributions k set status = 'confirmed', auto = true, confirmed_at = now()
    from rounds r, circle_members m
   where k.round_id = r.id and r.id in (ra.id, rb.id)
     and m.id = k.member_id and m.slot_group = r.slot_group;
end $$;
revoke execute on function public._execute_swap(swap_requests) from public, anon, authenticated;

create or replace function public.respond_swap(p_swap uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare s swap_requests; uid_from uuid; uid_to uuid;
begin
  select * into s from swap_requests where id = p_swap for update;
  if not found then raise exception 'Not found'; end if;
  select user_id into uid_from from circle_members where id = s.from_member;
  select user_id into uid_to   from circle_members where id = s.to_member;

  if p_action in ('accept', 'decline') then
    if uid_to <> auth.uid() or s.status <> 'pending' then raise exception 'Not allowed'; end if;
    update swap_requests set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
           updated_at = now() where id = p_swap;
    perform log_activity(s.circle_id, case when p_action = 'accept' then 'swap_accepted' else 'swap_declined' end,
      jsonb_build_object('from', uid_from));
  elsif p_action = 'cancel' then
    if uid_from <> auth.uid() or s.status not in ('pending','accepted') then raise exception 'Not allowed'; end if;
    update swap_requests set status = 'cancelled', updated_at = now() where id = p_swap;
  elsif p_action in ('approve', 'reject') then
    if not is_admin(s.circle_id) or s.status <> 'accepted' then raise exception 'Not allowed'; end if;
    if p_action = 'approve' then perform _execute_swap(s); end if;
    update swap_requests set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
           updated_at = now() where id = p_swap;
    perform log_activity(s.circle_id, case when p_action = 'approve' then 'swap_approved' else 'swap_rejected' end,
      jsonb_build_object('from', uid_from, 'to', uid_to));
  else
    raise exception 'Unknown action';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Storage: private receipts bucket, path = {circle_id}/{user_id}/{file}
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

create policy "receipts: members read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "receipts: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and public.is_member(((storage.foldername(name))[1])::uuid)
              and (storage.foldername(name))[2] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table
  public.circles, public.circle_members, public.rounds, public.contributions,
  public.swap_requests, public.activity;
