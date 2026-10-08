-- A small stand-in for the parts of Supabase the migrations rely on, so the real
-- migrations and their security rules can be tested on plain Postgres (locally
-- and in CI). It mirrors Supabase's defaults: anon/authenticated/service_role
-- roles, broad table grants in `public` (RLS is what actually protects data),
-- and auth.uid()/auth.email() reading the request's JWT claims.
-- Never run this against a real Supabase project.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;

-- Supabase grants everything in public to the API roles and relies on RLS.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Minimal Supabase Storage: buckets, objects (RLS on), and foldername().
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Test helpers: switch identity inside a transaction.
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.claims(p_role text, p_email text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_email is not null then
    insert into auth.users (email) values (lower(p_email)) on conflict (email) do nothing;
    select id into v_id from auth.users where email = lower(p_email);
  end if;
  perform set_config('request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('role', p_role, 'email', lower(p_email), 'sub', v_id))::text, true);
end $$;

create or replace function tests.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'not ok - %', p_name; end if;
  raise notice 'ok - %', p_name;
end $$;

-- Run a statement and require it to fail with a message matching p_pattern (ILIKE).
create or replace function tests.throws(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_pattern then
      raise notice 'ok - %', p_name;
      return;
    end if;
    raise exception 'not ok - % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'not ok - % (statement succeeded)', p_name;
end $$;

-- Run a statement and require it to change/return no rows (RLS silently filters).
create or replace function tests.affects_none(p_sql text, p_name text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'not ok - % (% rows affected)', p_name, n; end if;
  raise notice 'ok - %', p_name;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
