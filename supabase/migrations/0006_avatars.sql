-- Profile pictures.
--
-- Photos live in a public `avatars` bucket at {user_id}/{file}. Anyone can view them
-- (they're shown to circle members), but only the owner can upload, replace or delete
-- files in their own folder. The profile stores the public URL in `avatar_url`;
-- null means "use initials".

alter table public.profiles
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);

grant update (avatar_url) on public.profiles to authenticated;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

drop policy if exists "avatars: read" on storage.objects;
create policy "avatars: read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
