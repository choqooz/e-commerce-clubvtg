-- Run against a fresh disposable PostgreSQL 17 fixture after migrations 015–020.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true'
     or coalesce(current_setting('app.disposable_dblink_connection', true), '') = '' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void
language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'P0001', message = p_case;
  end if;
end;
$assert$;
grant execute on function pg_temp.assert_true(boolean, text) to service_role;

select pg_temp.assert_true(
  to_regprocedure('public.anonymize_clerk_user(text)') is not null,
  'clerk_anonymization_rpc_missing'
);
select pg_temp.assert_true(
  (select clerk_anonymization_activated_at is null from public.clerk_lifecycle_config where singleton)
  and (select prosecdef and proconfig @> array['search_path=""'] and pg_get_userbyid(proowner) = 'postgres'
       from pg_proc where oid = 'public.anonymize_clerk_user(text)'::regprocedure)
  and pg_get_functiondef('public.anonymize_clerk_user(text)'::regprocedure) ~ 'pg_advisory_xact_lock'
  and pg_get_functiondef('public.anonymize_clerk_user(text)'::regprocedure) ~ 'for update',
  'anonymization_security_or_lock_contract_invalid'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.anonymize_clerk_user(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.anonymize_clerk_user(text)', 'execute')
  and has_function_privilege('service_role', 'public.anonymize_clerk_user(text)', 'execute')
  and has_function_privilege('postgres', 'public.anonymize_clerk_user(text)', 'execute'),
  'anonymization_rpc_acl_invalid'
);
select pg_temp.assert_true(
  exists (select 1 from public.profiles where id = 'user_021_preexisting')
  and not exists (select 1 from public.clerk_anonymized_users where user_id = 'user_021_preexisting'),
  'migration_time_anonymization_or_backfill_detected'
);

insert into public.profiles (id, email, credits) values
  ('user_021_inactive', 'inactive@example.invalid', 4),
  ('user_021_rollback', 'rollback@example.invalid', 5),
  ('user_021_success', 'success@example.invalid', 6),
  ('user_021_concurrent', 'concurrent@example.invalid', 7);
insert into public.ai_tryon_logs (user_id, product_id, user_image_url)
select 'user_021_rollback', id, 'private://rollback' from public.products limit 1;
insert into public.ai_tryon_logs (user_id, product_id, user_image_url)
select 'user_021_success', id, 'private://success' from public.products limit 1;
insert into public.orders (id, user_id, purchase_user_id, customer_email, customer_name, shipping_info, tracking_number,
  status, total_amount, shipping_fee, mp_preference_id, mp_payment_id, integrity_version, payment_amount, payment_currency,
  payment_reference, payment_expires_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000121', 'user_021_success', 'user_021_success', 'success@example.invalid', 'Success Person',
   '{"street":"Private Street"}', 'TRACK-021', 'paid', 12000, 700, 'pref_021', 'payment_021', 1, 12000, 'ARS',
   'order:00000000-0000-0000-0000-000000000121', '2026-01-02T03:20:00Z', '2026-01-02T03:04:05Z', '2026-01-02T03:04:06Z');
insert into public.credit_transactions (id, user_id, amount, reason, mp_payment_id, created_at)
values ('00000000-0000-0000-0000-000000000122', 'user_021_success', 12, 'mp_credit_settlement', 'payment_021', '2026-01-02T03:04:07Z');
insert into public.credit_purchase_intents (id, user_id, pack_id, amount, currency, credits, reference, expires_at, preference_id,
  status, mp_payment_id, created_at, applied_at) values
  ('00000000-0000-0000-0000-000000000123', 'user_021_success', 'popular', 12000, 'ARS', 12, 'credit:021',
   '2026-01-02T03:19:00Z', 'pref_021', 'applied', 'payment_021', '2026-01-02T03:04:08Z', '2026-01-02T03:04:09Z');

set role service_role;
select pg_temp.assert_true(public.anonymize_clerk_user('user_021_inactive') = 'inactive', 'inactive_result_invalid');
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.profiles where id = 'user_021_inactive')
  and not exists (select 1 from public.clerk_anonymized_users where user_id = 'user_021_inactive'),
  'inactive_authority_mutated_state'
);

update public.clerk_lifecycle_config set clerk_anonymization_activated_at = pg_catalog.now() where singleton;
do $invalid$
begin
  begin perform public.anonymize_clerk_user('not a clerk id'); raise exception 'malformed_user_id_accepted';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.anonymize_clerk_user('user_021_missing'); raise exception 'missing_user_id_accepted';
  exception when sqlstate 'P0001' then null; end;
end;
$invalid$;

create function pg_temp.reject_profile_delete() returns trigger language plpgsql as $trigger$
begin
  if old.id = 'user_021_rollback' then raise exception 'forced_profile_delete_failure'; end if;
  return old;
end;
$trigger$;
create trigger reject_profile_delete before delete on public.profiles for each row execute function pg_temp.reject_profile_delete();
do $rollback$
begin
  begin perform public.anonymize_clerk_user('user_021_rollback'); raise exception 'forced_failure_not_raised';
  exception when raise_exception then if sqlerrm = 'forced_failure_not_raised' then raise; end if; end;
end;
$rollback$;
drop trigger reject_profile_delete on public.profiles;
select pg_temp.assert_true(
  exists (select 1 from public.profiles where id = 'user_021_rollback')
  and exists (select 1 from public.ai_tryon_logs where user_id = 'user_021_rollback')
  and not exists (select 1 from public.clerk_anonymized_users where user_id = 'user_021_rollback'),
  'forced_failure_did_not_rollback_every_effect'
);

create temp table retained_bytes (kind text primary key, payload bytea not null);
insert into retained_bytes select 'order', convert_to(concat_ws('|', id, status, total_amount, shipping_fee, mp_preference_id,
  mp_payment_id, payment_amount, payment_currency, payment_reference, payment_expires_at, created_at, updated_at), 'UTF8')
from public.orders where id = '00000000-0000-0000-0000-000000000121';
insert into retained_bytes select 'credit_transaction', convert_to(concat_ws('|', id, amount, reason, mp_payment_id, created_at), 'UTF8')
from public.credit_transactions where id = '00000000-0000-0000-0000-000000000122';
insert into retained_bytes select 'credit_purchase_intent', convert_to(concat_ws('|', id, pack_id, amount, currency, credits, reference,
  expires_at, preference_id, status, mp_payment_id, created_at, applied_at), 'UTF8')
from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000123';

set role service_role;
select pg_temp.assert_true(public.anonymize_clerk_user('user_021_success') = 'anonymized', 'first_anonymization_failed');
select pg_temp.assert_true(public.anonymize_clerk_user('user_021_success') = 'already_anonymized', 'duplicate_anonymization_failed');
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = 'user_021_success')
  and not exists (select 1 from public.ai_tryon_logs where user_id = 'user_021_success')
  and exists (select 1 from public.clerk_anonymized_users where user_id = 'user_021_success')
  and (select user_id is null and purchase_user_id is null and customer_email is null and customer_name is null and shipping_info is null
       and tracking_number is null and clerk_anonymized_at is not null from public.orders where id = '00000000-0000-0000-0000-000000000121')
  and (select user_id is null and clerk_anonymized_at is not null from public.credit_transactions where id = '00000000-0000-0000-0000-000000000122')
  and (select user_id is null and clerk_anonymized_at is not null from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000123'),
  'relational_cleanup_or_financial_anonymization_incomplete'
);
select pg_temp.assert_true(
  (select payload from retained_bytes where kind = 'order') = (select convert_to(concat_ws('|', id, status, total_amount, shipping_fee,
    mp_preference_id, mp_payment_id, payment_amount, payment_currency, payment_reference, payment_expires_at, created_at, updated_at), 'UTF8')
    from public.orders where id = '00000000-0000-0000-0000-000000000121')
  and (select payload from retained_bytes where kind = 'credit_transaction') = (select convert_to(concat_ws('|', id, amount, reason, mp_payment_id, created_at), 'UTF8') from public.credit_transactions where id = '00000000-0000-0000-0000-000000000122')
  and (select payload from retained_bytes where kind = 'credit_purchase_intent') = (select convert_to(concat_ws('|', id, pack_id, amount, currency, credits, reference, expires_at, preference_id, status, mp_payment_id, created_at, applied_at), 'UTF8') from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000123'),
  'retained_financial_facts_changed'
);

create extension if not exists dblink;
select dblink_connect('anonymize_a', current_setting('app.disposable_dblink_connection'));
select dblink_connect('anonymize_b', current_setting('app.disposable_dblink_connection'));
select dblink_send_query('anonymize_a', $$select public.anonymize_clerk_user('user_021_concurrent')$$);
select dblink_send_query('anonymize_b', $$select public.anonymize_clerk_user('user_021_concurrent')$$);
create temp table concurrent_results (result text not null);
insert into concurrent_results select result from dblink_get_result('anonymize_a') as result(result text);
insert into concurrent_results select result from dblink_get_result('anonymize_b') as result(result text);
select dblink_disconnect('anonymize_a'); select dblink_disconnect('anonymize_b');
select pg_temp.assert_true(
  (select count(*) = 1 from concurrent_results where result = 'anonymized')
  and (select count(*) = 1 from concurrent_results where result = 'already_anonymized')
  and not exists (select 1 from public.profiles where id = 'user_021_concurrent')
  and exists (select 1 from public.clerk_anonymized_users where user_id = 'user_021_concurrent'),
  'concurrent_anonymization_did_not_converge'
);
select '021_anonymization_proof_passed' as result,
  (select count(*) from concurrent_results where result = 'anonymized') as concurrent_anonymized,
  (select count(*) from concurrent_results where result = 'already_anonymized') as concurrent_already_anonymized;
