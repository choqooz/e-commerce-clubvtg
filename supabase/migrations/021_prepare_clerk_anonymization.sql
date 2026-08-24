-- Prepare inactive, service-only relational Clerk anonymization authority.
begin;

alter table public.clerk_lifecycle_config
  add column if not exists clerk_anonymization_activated_at timestamptz;

create table if not exists public.clerk_anonymized_users (
  user_id text primary key,
  anonymized_at timestamptz not null default pg_catalog.now(),
  check (user_id ~ '^user_[A-Za-z0-9_]+$')
);
alter table public.clerk_anonymized_users enable row level security;
revoke all on table public.clerk_anonymized_users from public, anon, authenticated, service_role;

create or replace function public.anonymize_clerk_user(p_user_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_activated_at timestamptz;
begin
  if p_user_id is null or pg_catalog.btrim(p_user_id) !~ '^user_[A-Za-z0-9_]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_user_id';
  end if;

  select config.clerk_anonymization_activated_at
  into v_activated_at
  from public.clerk_lifecycle_config as config
  where config.singleton
  for share;
  if not found or v_activated_at is null then
    return 'inactive';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 0));
  perform 1 from public.clerk_anonymized_users as users where users.user_id = p_user_id for update;
  if found then
    return 'already_anonymized';
  end if;

  perform 1 from public.profiles as profiles where profiles.id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'user_profile_not_found';
  end if;

  delete from public.ai_tryon_logs as logs where logs.user_id = p_user_id;
  update public.orders as orders
  set user_id = null, purchase_user_id = null, customer_email = null, customer_name = null,
      shipping_info = null, tracking_number = null, clerk_anonymized_at = pg_catalog.now()
  where orders.user_id = p_user_id or orders.purchase_user_id = p_user_id;
  update public.credit_transactions as transactions
  set user_id = null, clerk_anonymized_at = pg_catalog.now()
  where transactions.user_id = p_user_id;
  update public.credit_purchase_intents as intents
  set user_id = null, clerk_anonymized_at = pg_catalog.now()
  where intents.user_id = p_user_id;

  insert into public.clerk_anonymized_users (user_id) values (p_user_id);
  delete from public.profiles as profiles where profiles.id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_delete_failed';
  end if;
  return 'anonymized';
end;
$function$;

alter function public.anonymize_clerk_user(text) owner to postgres;
revoke execute on function public.anonymize_clerk_user(text) from public, anon, authenticated;
grant execute on function public.anonymize_clerk_user(text) to service_role, postgres;

commit;
