-- Harden privileged credit RPCs without changing their callable signatures.

create or replace function public.use_ai_credit(
  p_user_id pg_catalog.text,
  p_product_id pg_catalog.uuid,
  p_user_image_url pg_catalog.text
) returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_log_id pg_catalog.uuid;
  v_credits pg_catalog.int4;
  v_product_status public.product_status;
begin
  if p_user_id is null or pg_catalog.btrim(p_user_id) !~ '^user_[A-Za-z0-9_]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_user_id';
  end if;

  if p_user_image_url is null or pg_catalog.btrim(p_user_image_url) = '' then
    raise exception using errcode = 'P0001', message = 'invalid_user_image_url';
  end if;

  select products.status into v_product_status
  from public.products
  where products.id = p_product_id
  for key share;

  if not found or v_product_status <> 'available'::public.product_status then
    raise exception using errcode = 'P0001', message = 'product_not_available';
  end if;

  select profiles.credits into v_credits
  from public.profiles
  where profiles.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'user_profile_not_found';
  end if;

  if v_credits <= 0 then
    raise exception using errcode = 'P0001', message = 'insufficient_credits';
  end if;

  update public.profiles
  set credits = credits - 1, updated_at = pg_catalog.now()
  where profiles.id = p_user_id;

  insert into public.ai_tryon_logs (user_id, product_id, user_image_url, status)
  values (p_user_id, p_product_id, p_user_image_url, 'processing')
  returning id into v_log_id;

  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, -1, 'ai_tryon');

  return v_log_id;
end;
$function$;

create or replace function public.refund_ai_credit(
  p_log_id pg_catalog.uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id pg_catalog.text;
begin
  select logs.user_id into v_user_id
  from public.ai_tryon_logs as logs
  where logs.id = p_log_id
    and logs.status = 'failed'
    and logs.credits_charged > 0
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'log_not_found_or_already_refunded';
  end if;

  perform 1
  from public.profiles
  where profiles.id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'user_profile_not_found';
  end if;

  update public.profiles
  set credits = credits + 1, updated_at = pg_catalog.now()
  where profiles.id = v_user_id;

  update public.ai_tryon_logs
  set credits_charged = 0
  where ai_tryon_logs.id = p_log_id;

  insert into public.credit_transactions (user_id, amount, reason)
  values (v_user_id, 1, 'refund');
end;
$function$;

create or replace function public.increment_credits(
  row_id pg_catalog.text,
  amount pg_catalog.int4
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if row_id is null or pg_catalog.btrim(row_id) !~ '^user_[A-Za-z0-9_]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_user_id';
  end if;

  if amount is null or amount <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_credit_amount';
  end if;

  perform 1
  from public.profiles
  where profiles.id = row_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'user_profile_not_found';
  end if;

  update public.profiles
  set credits = credits + amount, updated_at = pg_catalog.now()
  where profiles.id = row_id;
end;
$function$;

revoke execute on function public.use_ai_credit(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.refund_ai_credit(uuid) from public, anon, authenticated;
revoke execute on function public.increment_credits(text, integer) from public, anon, authenticated;

grant execute on function public.use_ai_credit(text, uuid, text) to service_role, postgres;
grant execute on function public.refund_ai_credit(uuid) to service_role, postgres;
grant execute on function public.increment_credits(text, integer) to service_role, postgres;

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
