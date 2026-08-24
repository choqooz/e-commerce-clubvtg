-- Prepare inactive, prospective Clerk registration-bonus authority.
begin;

alter table public.profiles
  add column if not exists registration_bonus_granted_at timestamptz;

create table if not exists public.clerk_lifecycle_config (
  singleton boolean primary key default true check (singleton),
  registration_bonus_activated_at timestamptz
);
alter table public.clerk_lifecycle_config enable row level security;
revoke all on table public.clerk_lifecycle_config from public, anon, authenticated, service_role;
insert into public.clerk_lifecycle_config (singleton, registration_bonus_activated_at)
values (true, null)
on conflict (singleton) do nothing;

create or replace function public.apply_clerk_registration_bonus(
  p_user_id text,
  p_event_time timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_activated_at timestamptz;
  v_granted_at timestamptz;
begin
  if p_user_id is null or pg_catalog.btrim(p_user_id) !~ '^user_[A-Za-z0-9_]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_user_id';
  end if;

  select config.registration_bonus_activated_at
  into v_activated_at
  from public.clerk_lifecycle_config as config
  where config.singleton
  for share;

  if not found or v_activated_at is null then
    return 'inactive';
  end if;

  if p_event_time is null or p_event_time < v_activated_at then
    return 'ineligible';
  end if;

  select profiles.registration_bonus_granted_at
  into v_granted_at
  from public.profiles as profiles
  where profiles.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'user_profile_not_found';
  end if;

  if v_granted_at is not null then
    return 'already_granted';
  end if;

  update public.profiles as profile
  set credits = profile.credits + 2,
      registration_bonus_granted_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where profile.id = p_user_id
    and profile.registration_bonus_granted_at is null;

  if not found then
    return 'already_granted';
  end if;

  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, 2, 'registration_bonus');

  return 'granted';
end;
$function$;

revoke execute on function public.apply_clerk_registration_bonus(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_clerk_registration_bonus(text, timestamptz)
  to service_role, postgres;

commit;
