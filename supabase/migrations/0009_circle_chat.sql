-- 0009: group chat for each online paluwagan.
--
-- Only approved members of a paluwagan can read and send its messages.
-- Members can delete their own messages; the admin can delete any (moderation).
-- Messages are pushed live through Supabase Realtime.
--
-- Safe to run on top of 0001–0008.

create table if not exists public.circle_messages (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists circle_messages_circle_time on public.circle_messages (circle_id, created_at desc);

alter table public.circle_messages enable row level security;

drop policy if exists "messages: members read" on public.circle_messages;
create policy "messages: members read" on public.circle_messages for select to authenticated
  using (public.is_member(circle_id));

-- Send as yourself, only to a paluwagan you're an approved member of, and not after it's deleted.
drop policy if exists "messages: members send" on public.circle_messages;
create policy "messages: members send" on public.circle_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member(circle_id)
    and not exists (select 1 from public.circles c where c.id = circle_id and c.deleted_at is not null)
  );

drop policy if exists "messages: delete own or admin" on public.circle_messages;
create policy "messages: delete own or admin" on public.circle_messages for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(circle_id));

-- Messages can't be edited (keeps the record honest).
revoke update on public.circle_messages from authenticated;

-- Live updates. Full row on delete so clients can remove the message by id.
alter table public.circle_messages replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.circle_messages;
exception when duplicate_object then null;
end $$;
