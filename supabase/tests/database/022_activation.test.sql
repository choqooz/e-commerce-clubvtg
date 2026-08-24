-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–021.
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

\if :{?pre_activation}
select pg_temp.assert_true(
  (select registration_bonus_activated_at is null and clerk_anonymization_activated_at is null
   from public.clerk_lifecycle_config where singleton),
  'predecessor_authorities_must_remain_inactive'
);

create table public.clerk_activation_test_snapshots (kind text primary key, payload jsonb not null);
insert into public.profiles (id, email, credits) values
  ('user_022_legacy', 'legacy@example.invalid', 9),
  ('user_022_bonus', 'bonus@example.invalid', 7),
  ('user_022_concurrent', 'concurrent@example.invalid', 0),
  ('user_022_delete', 'delete@example.invalid', 6),
  ('user_022_retry', 'retry@example.invalid', 4);
insert into public.products (title, slug, price, category)
values ('Activation fixture', 'activation-fixture', 1, 'fixture');
insert into public.ai_tryon_logs (user_id, product_id, user_image_url)
select 'user_022_delete', id, 'private://delete' from public.products where slug = 'activation-fixture';
insert into public.ai_tryon_logs (user_id, product_id, user_image_url)
select 'user_022_retry', id, 'private://retry' from public.products where slug = 'activation-fixture';
insert into public.orders (id, user_id, purchase_user_id, customer_email, customer_name, shipping_info, tracking_number,
  status, total_amount, shipping_fee, mp_preference_id, mp_payment_id, integrity_version, payment_amount, payment_currency,
  payment_reference, payment_expires_at)
values ('00000000-0000-0000-0000-000000000221', 'user_022_delete', 'user_022_delete', 'delete@example.invalid', 'Delete Person',
  '{"street":"Private Street"}', 'TRACK-022', 'paid', 12000, 700, 'pref_022', 'payment_022', 1, 12000, 'ARS',
  'order:00000000-0000-0000-0000-000000000221', '2026-01-02T03:20:00Z');
insert into public.credit_transactions (id, user_id, amount, reason, mp_payment_id)
values ('00000000-0000-0000-0000-000000000222', 'user_022_delete', 12, 'mp_credit_settlement', 'payment_022');
insert into public.credit_purchase_intents (id, user_id, pack_id, amount, currency, credits, reference, expires_at, preference_id, status, mp_payment_id, applied_at)
values ('00000000-0000-0000-0000-000000000223', 'user_022_delete', 'popular', 12000, 'ARS', 12, 'credit:022',
  '2026-01-02T03:19:00Z', 'pref_022', 'applied', 'payment_022', '2026-01-02T03:04:09Z');
insert into public.clerk_anonymized_users (user_id) values ('user_022_tombstone');
insert into public.clerk_activation_test_snapshots
select 'legacy_profile', to_jsonb(profiles) from public.profiles as profiles where id = 'user_022_legacy'
union all select 'order_facts', jsonb_build_object('id', id, 'status', status, 'total_amount', total_amount, 'shipping_fee', shipping_fee, 'mp_preference_id', mp_preference_id, 'mp_payment_id', mp_payment_id, 'payment_amount', payment_amount, 'payment_currency', payment_currency, 'payment_reference', payment_reference, 'payment_expires_at', payment_expires_at) from public.orders where id = '00000000-0000-0000-0000-000000000221'
union all select 'transaction_facts', jsonb_build_object('id', id, 'amount', amount, 'reason', reason, 'mp_payment_id', mp_payment_id, 'created_at', created_at) from public.credit_transactions where id = '00000000-0000-0000-0000-000000000222'
union all select 'intent_facts', jsonb_build_object('id', id, 'pack_id', pack_id, 'amount', amount, 'currency', currency, 'credits', credits, 'reference', reference, 'expires_at', expires_at, 'preference_id', preference_id, 'status', status, 'mp_payment_id', mp_payment_id, 'applied_at', applied_at) from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000223'
union all select 'tombstone', to_jsonb(users) from public.clerk_anonymized_users as users where user_id = 'user_022_tombstone';
select '022_pre_activation_fixture_ready' as result;
\quit
\endif

select pg_temp.assert_true(
  (select registration_bonus_activated_at is not null and clerk_anonymization_activated_at is not null
   and registration_bonus_activated_at = clerk_anonymization_activated_at
   from public.clerk_lifecycle_config where singleton),
  'activation_must_enable_both_authorities_together'
);
select pg_temp.assert_true(
  (select payload from public.clerk_activation_test_snapshots where kind = 'legacy_profile') =
    (select to_jsonb(profiles) from public.profiles as profiles where id = 'user_022_legacy')
  and (select payload from public.clerk_activation_test_snapshots where kind = 'order_facts') =
    (select jsonb_build_object('id', id, 'status', status, 'total_amount', total_amount, 'shipping_fee', shipping_fee, 'mp_preference_id', mp_preference_id, 'mp_payment_id', mp_payment_id, 'payment_amount', payment_amount, 'payment_currency', payment_currency, 'payment_reference', payment_reference, 'payment_expires_at', payment_expires_at) from public.orders where id = '00000000-0000-0000-0000-000000000221')
  and (select payload from public.clerk_activation_test_snapshots where kind = 'transaction_facts') =
    (select jsonb_build_object('id', id, 'amount', amount, 'reason', reason, 'mp_payment_id', mp_payment_id, 'created_at', created_at) from public.credit_transactions where id = '00000000-0000-0000-0000-000000000222')
  and (select payload from public.clerk_activation_test_snapshots where kind = 'intent_facts') =
    (select jsonb_build_object('id', id, 'pack_id', pack_id, 'amount', amount, 'currency', currency, 'credits', credits, 'reference', reference, 'expires_at', expires_at, 'preference_id', preference_id, 'status', status, 'mp_payment_id', mp_payment_id, 'applied_at', applied_at) from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000223')
  and (select payload from public.clerk_activation_test_snapshots where kind = 'tombstone') =
    (select to_jsonb(users) from public.clerk_anonymized_users as users where user_id = 'user_022_tombstone'),
  'activation_backfilled_or_mutated_historical_data'
);

set role service_role;
select pg_temp.assert_true(public.apply_clerk_registration_bonus('user_022_bonus', pg_catalog.now()) = 'granted', 'active_bonus_not_granted');
select pg_temp.assert_true(public.apply_clerk_registration_bonus('user_022_bonus', pg_catalog.now()) = 'already_granted', 'duplicate_bonus_not_noop');
reset role;
create extension if not exists dblink;
select dblink_connect('activation_bonus_a', current_setting('app.disposable_dblink_connection'));
select dblink_connect('activation_bonus_b', current_setting('app.disposable_dblink_connection'));
select dblink_send_query('activation_bonus_a', $$select public.apply_clerk_registration_bonus('user_022_concurrent', pg_catalog.now())$$);
select dblink_send_query('activation_bonus_b', $$select public.apply_clerk_registration_bonus('user_022_concurrent', pg_catalog.now())$$);
create temp table concurrent_bonus_results (result text not null);
insert into concurrent_bonus_results select result from dblink_get_result('activation_bonus_a') as result(result text);
insert into concurrent_bonus_results select result from dblink_get_result('activation_bonus_b') as result(result text);
select dblink_disconnect('activation_bonus_a'); select dblink_disconnect('activation_bonus_b');
select pg_temp.assert_true(
  (select credits = 9 and registration_bonus_granted_at is not null from public.profiles where id = 'user_022_bonus')
  and (select count(*) = 1 from public.credit_transactions where user_id = 'user_022_bonus' and amount = 2 and reason = 'registration_bonus')
  and (select count(*) = 1 from concurrent_bonus_results where result = 'granted')
  and (select count(*) = 1 from concurrent_bonus_results where result = 'already_granted')
  and (select credits = 2 from public.profiles where id = 'user_022_concurrent')
  and (select count(*) = 1 from public.credit_transactions where user_id = 'user_022_concurrent' and amount = 2 and reason = 'registration_bonus'),
  'active_bonus_not_exactly_once'
);

set role service_role;
select pg_temp.assert_true(public.anonymize_clerk_user('user_022_delete') = 'anonymized', 'active_anonymization_failed');
select pg_temp.assert_true(public.anonymize_clerk_user('user_022_delete') = 'already_anonymized', 'duplicate_anonymization_not_noop');
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = 'user_022_delete')
  and not exists (select 1 from public.ai_tryon_logs where user_id = 'user_022_delete')
  and (select user_id is null and purchase_user_id is null and customer_email is null and customer_name is null and shipping_info is null and tracking_number is null from public.orders where id = '00000000-0000-0000-0000-000000000221')
  and (select user_id is null from public.credit_transactions where id = '00000000-0000-0000-0000-000000000222')
  and (select user_id is null from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000223'),
  'active_anonymization_did_not_clear_operational_pii'
);

create function pg_temp.reject_022_profile_delete() returns trigger language plpgsql as $trigger$
begin
  if old.id = 'user_022_retry' then raise exception 'forced_retry_failure'; end if;
  return old;
end;
$trigger$;
create trigger reject_022_profile_delete before delete on public.profiles for each row execute function pg_temp.reject_022_profile_delete();
do $failure$
begin
  begin perform public.anonymize_clerk_user('user_022_retry'); raise exception 'forced_retry_failure_not_raised';
  exception when raise_exception then if sqlerrm = 'forced_retry_failure_not_raised' then raise; end if; end;
end;
$failure$;
drop trigger reject_022_profile_delete on public.profiles;
set role service_role;
select pg_temp.assert_true(public.anonymize_clerk_user('user_022_retry') = 'anonymized', 'retry_anonymization_failed');
select pg_temp.assert_true(public.anonymize_clerk_user('user_022_retry') = 'already_anonymized', 'retry_acknowledgment_not_idempotent');
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = 'user_022_retry')
  and not exists (select 1 from public.ai_tryon_logs where user_id = 'user_022_retry'),
  'retry_did_not_converge'
);
select '022_activation_proof_passed' as result,
  (select count(*) from concurrent_bonus_results where result = 'granted') as concurrent_grants,
  (select count(*) from concurrent_bonus_results where result = 'already_granted') as concurrent_replays;
