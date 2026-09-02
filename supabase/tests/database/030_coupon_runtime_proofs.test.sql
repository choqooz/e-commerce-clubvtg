-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–029.
do $guard$ begin if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if; end $guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$ begin if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if; end $assert$;

insert into public.profiles (id, email, credits) values
  ('runtime_race_a', 'race-a@example.invalid', 0),
  ('runtime_race_b', 'race-b@example.invalid', 0),
  ('runtime_depleted_a', 'depleted-a@example.invalid', 0),
  ('runtime_depleted_b', 'depleted-b@example.invalid', 0),
  ('runtime_recreated_original', 'recreated@example.invalid', 0),
  ('runtime_recreated_account', 'recreated-new@example.invalid', 0),
  ('runtime_late_approval', 'late-approval@example.invalid', 0);
insert into public.products (id, title, slug, price, category) values
  ('30000000-0000-0000-0000-000000000001', 'Runtime race A', 'runtime-race-a', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000002', 'Runtime race B', 'runtime-race-b', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000003', 'Runtime expired', 'runtime-expired', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000004', 'Runtime depleted A', 'runtime-depleted-a', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000005', 'Runtime depleted B', 'runtime-depleted-b', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000006', 'Runtime deactivated', 'runtime-deactivated', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000007', 'Runtime recreated A', 'runtime-recreated-a', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000008', 'Runtime recreated B', 'runtime-recreated-b', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000009', 'Runtime replacement', 'runtime-replacement', 100, 'fixture'),
  ('30000000-0000-0000-0000-000000000010', 'Runtime late approval', 'runtime-late-approval', 100, 'fixture');

create table public.runtime_coupon_attempts (attempt text primary key, outcome text not null);
create function public.runtime_coupon_checkout_attempt(p_attempt text, p_user_id text, p_product_id uuid, p_coupon_code text, p_fingerprint text) returns text language plpgsql set search_path = '' as $attempt$
begin
  perform public.create_product_checkout(p_user_id, jsonb_build_object('email', p_user_id || '@example.invalid', 'fullName', p_user_id), array[p_product_id], 0, 'coupon', p_coupon_code, 'v1', p_fingerprint);
  insert into public.runtime_coupon_attempts (attempt, outcome) values (p_attempt, 'reserved');
  return 'reserved';
exception when others then
  insert into public.runtime_coupon_attempts (attempt, outcome) values (p_attempt, sqlerrm);
  return sqlerrm;
end;
$attempt$;

select public.create_coupon('runtime_admin', 'RACE1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 5000, null) as race_coupon_id \gset
create extension if not exists dblink;
select dblink_connect('runtime_race_a', current_setting('app.disposable_dblink_connection'));
select dblink_connect('runtime_race_b', current_setting('app.disposable_dblink_connection'));
select dblink_exec('runtime_race_a', 'begin');
select dblink_exec('runtime_race_b', 'begin');
select dblink_send_query('runtime_race_a', $$select public.runtime_coupon_checkout_attempt('race-a', 'runtime_race_a', '30000000-0000-0000-0000-000000000001'::uuid, 'RACE1', repeat('a', 64))$$);
do $wait$ begin while dblink_is_busy('runtime_race_a') = 1 loop perform pg_sleep(0.01); end loop; end $wait$;
select * from dblink_get_result('runtime_race_a') as result(outcome text);
select * from dblink_get_result('runtime_race_a') as result(outcome text);
select dblink_send_query('runtime_race_b', $$select public.runtime_coupon_checkout_attempt('race-b', 'runtime_race_b', '30000000-0000-0000-0000-000000000002'::uuid, 'RACE1', repeat('b', 64))$$);
select pg_temp.assert_true(dblink_is_busy('runtime_race_b') = 1, 'final_slot_checkout_transactions_did_not_overlap');
select dblink_exec('runtime_race_a', 'commit');
do $wait$ begin while dblink_is_busy('runtime_race_b') = 1 loop perform pg_sleep(0.01); end loop; end $wait$;
select * from dblink_get_result('runtime_race_b') as result(outcome text);
select * from dblink_get_result('runtime_race_b') as result(outcome text);
select dblink_exec('runtime_race_b', 'commit');
select dblink_disconnect('runtime_race_a');
select dblink_disconnect('runtime_race_b');
select pg_temp.assert_true(
  (select count(*) = 1 from public.runtime_coupon_attempts where outcome = 'reserved')
  and (select count(*) = 1 from public.runtime_coupon_attempts where outcome = 'coupon_unavailable')
  and (select used_count = 1 and capacity = 1 from public.coupon_definitions where id = :'race_coupon_id'::uuid)
  and (select count(*) = 1 from public.coupon_checkout_reservations where coupon_id = :'race_coupon_id'::uuid and reservation_state = 'reserved')
  and (select count(*) = 1 from public.orders where coupon_id = :'race_coupon_id'::uuid and coupon_reservation_state = 'reserved')
  and (select count(*) = 1 from public.products where id in ('30000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000002'::uuid) and status = 'reserved'),
  'final_slot_race_must_create_exactly_one_reservation_without_oversubscription'
);

select public.create_coupon('runtime_admin', 'EXPIRED1', 1, statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour', 1000, null) as expired_coupon_id \gset
do $expired$ begin
  begin perform public.quote_coupon_checkout(array['30000000-0000-0000-0000-000000000003'::uuid], 'EXPIRED1', 'v1', repeat('c', 64), 0, 'coupon'); raise exception 'expired_quote_accepted'; exception when others then if sqlerrm <> 'coupon_unavailable' then raise; end if; end;
  begin perform public.create_product_checkout('runtime_depleted_a', jsonb_build_object('email', 'depleted-a@example.invalid', 'fullName', 'Expired'), array['30000000-0000-0000-0000-000000000003'::uuid], 0, 'coupon', 'EXPIRED1', 'v1', repeat('c', 64)); raise exception 'expired_checkout_accepted'; exception when others then if sqlerrm <> 'coupon_unavailable' then raise; end if; end;
end $expired$;
select pg_temp.assert_true((select used_count = 0 from public.coupon_definitions where id = :'expired_coupon_id'::uuid) and not exists (select 1 from public.coupon_checkout_reservations where coupon_id = :'expired_coupon_id'::uuid) and not exists (select 1 from public.coupon_identity_uses where coupon_id = :'expired_coupon_id'::uuid), 'expired_coupon_rejection_must_not_mutate_capacity_or_identity');

select public.create_coupon('runtime_admin', 'DEPLETED1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null) as depleted_coupon_id \gset
select public.create_product_checkout('runtime_depleted_a', jsonb_build_object('email', 'depleted-a@example.invalid', 'fullName', 'Depleted'), array['30000000-0000-0000-0000-000000000004'::uuid], 0, 'coupon', 'DEPLETED1', 'v1', repeat('d', 64));
do $depleted$ begin begin perform public.create_product_checkout('runtime_depleted_b', jsonb_build_object('email', 'depleted-b@example.invalid', 'fullName', 'Depleted'), array['30000000-0000-0000-0000-000000000005'::uuid], 0, 'coupon', 'DEPLETED1', 'v1', repeat('e', 64)); raise exception 'depleted_checkout_accepted'; exception when others then if sqlerrm <> 'coupon_unavailable' then raise; end if; end; end $depleted$;
select pg_temp.assert_true((select used_count = 1 and capacity = 1 from public.coupon_definitions where id = :'depleted_coupon_id'::uuid) and (select count(*) = 1 from public.coupon_checkout_reservations where coupon_id = :'depleted_coupon_id'::uuid) and not exists (select 1 from public.coupon_checkout_reservations where coupon_id = :'depleted_coupon_id'::uuid and fingerprint = repeat('e', 64)), 'depleted_coupon_rejection_must_not_oversubscribe_or_record_a_second_identity');

select public.create_coupon('runtime_admin', 'DEACT1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null) as deactivated_coupon_id \gset
select public.deactivate_coupon('runtime_admin', :'deactivated_coupon_id'::uuid, 'Runtime invalid-state proof');
do $deactivated$ begin begin perform public.create_product_checkout('runtime_depleted_b', jsonb_build_object('email', 'depleted-b@example.invalid', 'fullName', 'Deactivated'), array['30000000-0000-0000-0000-000000000006'::uuid], 0, 'coupon', 'DEACT1', 'v1', repeat('f', 64)); raise exception 'deactivated_checkout_accepted'; exception when others then if sqlerrm <> 'coupon_unavailable' then raise; end if; end; end $deactivated$;
select pg_temp.assert_true((select used_count = 0 and not is_active from public.coupon_definitions where id = :'deactivated_coupon_id'::uuid) and not exists (select 1 from public.coupon_checkout_reservations where coupon_id = :'deactivated_coupon_id'::uuid) and not exists (select 1 from public.coupon_identity_uses where coupon_id = :'deactivated_coupon_id'::uuid), 'deactivated_coupon_rejection_must_not_mutate_capacity_or_identity');

select public.create_coupon('runtime_admin', 'RECREATE1', 2, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null) as recreated_coupon_id \gset
select public.create_product_checkout('runtime_recreated_original', jsonb_build_object('email', 'recreated@example.invalid', 'fullName', 'Original account'), array['30000000-0000-0000-0000-000000000007'::uuid], 0, 'coupon', 'RECREATE1', 'v1', repeat('1', 64));
do $recreated$ begin begin perform public.create_product_checkout('runtime_recreated_account', jsonb_build_object('email', 'recreated@example.invalid', 'fullName', 'Recreated account'), array['30000000-0000-0000-0000-000000000008'::uuid], 0, 'coupon', 'RECREATE1', 'v1', repeat('1', 64)); raise exception 'recreated_account_checkout_accepted'; exception when others then if sqlerrm <> 'coupon_identity_already_used' then raise; end if; end; end $recreated$;
select pg_temp.assert_true((select used_count = 1 from public.coupon_definitions where id = :'recreated_coupon_id'::uuid) and (select count(*) = 1 from public.coupon_checkout_reservations where coupon_id = :'recreated_coupon_id'::uuid and fingerprint = repeat('1', 64)) and not exists (select 1 from public.coupon_checkout_reservations where coupon_id = :'recreated_coupon_id'::uuid and order_id in (select id from public.orders where user_id = 'runtime_recreated_account')), 'recreated_account_must_not_bypass_pseudonymous_coupon_identity');

select public.create_coupon('runtime_admin', 'REPLACE1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null) as replaced_coupon_id \gset
select public.replace_coupon('runtime_admin', :'replaced_coupon_id'::uuid, 'REPLACED1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null, 'Runtime replacement proof') as replacement_coupon_id \gset
do $replacement$ begin begin perform public.create_product_checkout('runtime_depleted_b', jsonb_build_object('email', 'depleted-b@example.invalid', 'fullName', 'Replacement'), array['30000000-0000-0000-0000-000000000009'::uuid], 0, 'coupon', 'REPLACE1', 'v1', repeat('2', 64)); raise exception 'replaced_coupon_checkout_accepted'; exception when others then if sqlerrm <> 'coupon_unavailable' then raise; end if; end; end $replacement$;
select pg_temp.assert_true((select not is_active from public.coupon_definitions where id = :'replaced_coupon_id'::uuid) and (select is_active from public.coupon_definitions where id = :'replacement_coupon_id'::uuid) and exists (select 1 from public.coupon_audit_events where coupon_id = :'replaced_coupon_id'::uuid and action = 'replaced' and reason = 'Runtime replacement proof') and exists (select 1 from public.coupon_audit_events where coupon_id = :'replacement_coupon_id'::uuid and action = 'replacement_created' and reason = 'Runtime replacement proof') and not exists (select 1 from public.coupon_checkout_reservations where coupon_id = :'replaced_coupon_id'::uuid), 'manual_replacement_must_be_audited_without_reactivating_or_reserving_the_predecessor');

select public.create_coupon('runtime_admin', 'LATE1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 5000, null) as late_coupon_id \gset
create temp table late_order as select * from public.create_product_checkout('runtime_late_approval', jsonb_build_object('email', 'late-approval@example.invalid', 'fullName', 'Late approval'), array['30000000-0000-0000-0000-000000000010'::uuid], 0, 'coupon', 'LATE1', 'v1', repeat('3', 64));
select public.expire_product_reservations(statement_timestamp() + interval '1 hour', 10);
select pg_temp.assert_true((select status = 'cancelled' and coupon_reservation_state = 'released' from public.orders where id = (select order_id from late_order)) and (select used_count = 0 from public.coupon_definitions where id = :'late_coupon_id'::uuid) and (select status = 'available' from public.products where id = '30000000-0000-0000-0000-000000000010'::uuid), 'expired_coupon_reservation_must_be_released_before_late_approval');
create temp table late_approval as select * from public.settle_product_payment('mercadopago', 'pay-runtime-late', 'approved', (select reference from late_order), 50, 'ARS', null);
select pg_temp.assert_true((select not newly_applied and result = 'late_approval_manual_review' from late_approval) and (select status = 'cancelled' and coupon_reservation_state = 'released' from public.orders where id = (select order_id from late_order)) and (select used_count = 0 from public.coupon_definitions where id = :'late_coupon_id'::uuid) and (select status = 'available' from public.products where id = '30000000-0000-0000-0000-000000000010'::uuid) and exists (select 1 from public.payment_manual_reviews where payment_id = 'pay-runtime-late' and review_kind = 'late_approval_refund_required') and not exists (select 1 from public.coupon_checkout_reservations where order_id = (select order_id from late_order)) and not exists (select 1 from public.coupon_identity_uses where coupon_id = :'late_coupon_id'::uuid), 'late_approval_must_require_manual_review_without_reacquiring_stock_or_coupon_capacity');

select '030_coupon_runtime_proofs_passed' as result;
