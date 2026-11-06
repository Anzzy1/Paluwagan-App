-- Minimal stand-in for the Supabase platform so the migration can be tested
-- on vanilla Postgres (see supabase/tests/run.sh). NOT for production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema storage;
create schema extensions;

create table auth.users (id uuid primary key, phone text, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create publication supabase_realtime;

grant usage on schema public, auth, storage, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant all on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
