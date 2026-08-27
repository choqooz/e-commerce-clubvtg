do $roles$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $roles$;
do $roles$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $roles$;
do $roles$
begin
  create role service_role nologin;
exception when duplicate_object then null;
end $roles$;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
alter default privileges for role postgres grant execute on functions to service_role;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null);
create table if not exists storage.objects (bucket_id text not null, name text not null);
create or replace function storage.foldername(path text) returns text[] language sql immutable as $$
  select string_to_array(path, '/')
$$;
