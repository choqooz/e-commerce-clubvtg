-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–025.
do $guard$ begin if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if; end $guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$ begin if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if; end $assert$;

insert into public.product_types (name) values ('Coupon coats');
insert into public.product_subtypes (product_type_id, name) select id, 'Coupon wool' from public.product_types where name = 'Coupon coats';
insert into public.products (title, slug, price, category, product_type_id, product_subtype_id)
select 'Coupon coat', 'coupon-coat', 10000, 'Coats', types.id, subtypes.id from public.product_types types join public.product_subtypes subtypes on subtypes.product_type_id = types.id where types.name = 'Coupon coats';
select id as coupon_type_id from public.product_types where name = 'Coupon coats' \gset
select id as coupon_subtype_id from public.product_subtypes where name = 'Coupon wool' \gset
select id as coupon_product_id from public.products where slug = 'coupon-coat' \gset

set role service_role;
select public.create_promotion('coupon_admin', 3000, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', jsonb_build_array(jsonb_build_object('product_type_id', :'coupon_type_id'::uuid, 'product_subtype_id', :'coupon_subtype_id'::uuid)));
select public.create_coupon('coupon_admin', 'SAVE50', 2, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', null, 600000) as fixed_coupon_id \gset
select public.create_coupon('coupon_admin', 'HALF', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 5000, null) as percent_coupon_id \gset
reset role;

create temp table quote_default as select * from public.quote_coupon_checkout(array[:'coupon_product_id'::uuid], ' save50 ', 'v1', repeat('a', 64), 200000, null);
select pg_temp.assert_true(
  (select merchandise_subtotal_cents = 1000000 and shipping_cents = 200000 and promotion_discount_cents = 300000 and coupon_discount_cents = 500000 and default_source = 'promotions' and selected_source = 'promotions' and winning_source = 'coupon' from quote_default)
  and (select count(*) = 0 from public.coupon_identity_uses)
  and (select used_count = 0 from public.coupon_definitions where id = :'fixed_coupon_id'::uuid)
  and not ((select row_to_json(quote_default)::jsonb from quote_default) ?| array['identity_fingerprint', 'identity_key_version', 'capacity', 'used_count']),
  'quote_must_be_non_reserving_merchandise_only_and_safe'
);
create temp table quote_percent as select * from public.quote_coupon_checkout(array[:'coupon_product_id'::uuid], 'half', 'v1', repeat('b', 64), 0, 'coupon');
select pg_temp.assert_true((select coupon_discount_cents = 500000 and selected_source = 'coupon' from quote_percent), 'percentage_coupon_must_cap_at_fifty_percent');

do $constraints$
begin
  begin perform public.create_coupon('coupon_admin', 'save50', 1, statement_timestamp(), statement_timestamp() + interval '1 hour', 1000, null); raise exception 'canonical_code_unique_missing'; exception when unique_violation then null; end;
  begin perform public.create_coupon('coupon_admin', 'TOO-MUCH', 1, statement_timestamp(), statement_timestamp() + interval '1 hour', 5001, null); raise exception 'percentage_cap_missing'; exception when others then if sqlerrm <> 'coupon_terms_invalid' then raise; end if; end;
  begin perform public.create_coupon('coupon_admin', 'NO-CAP', 0, statement_timestamp(), statement_timestamp() + interval '1 hour', 1000, null); raise exception 'finite_capacity_missing'; exception when check_violation then null; end;
  insert into public.coupon_identity_uses (coupon_id, key_version, fingerprint) values ((select id from public.coupon_definitions where code = 'SAVE50'), 'v1', repeat('a', 64));
  begin perform public.quote_coupon_checkout(array[(select id from public.products where slug = 'coupon-coat')], 'SAVE50', 'v1', repeat('a', 64), 0, null); raise exception 'identity_reuse_allowed'; exception when others then if sqlerrm <> 'coupon_identity_already_used' then raise; end if; end;
  begin perform public.replace_coupon('coupon_admin', (select id from public.coupon_definitions where code = 'SAVE50'), 'REPLACED', 1, statement_timestamp(), statement_timestamp() + interval '1 hour', 1000, null, 'manual customer support replacement'); exception when others then raise; end;
  begin perform public.replace_coupon('coupon_admin', (select id from public.coupon_definitions where code = 'HALF'), 'NO-REASON', 1, statement_timestamp(), statement_timestamp() + interval '1 hour', 1000, null, ''); raise exception 'replacement_reason_optional'; exception when others then if sqlerrm <> 'coupon_replacement_reason_required' then raise; end if; end;
end $constraints$;
select pg_temp.assert_true((select not is_active from public.coupon_definitions where id = :'fixed_coupon_id'::uuid) and exists (select 1 from public.coupon_definitions where code = 'REPLACED') and exists (select 1 from public.coupon_audit_events where coupon_id = :'fixed_coupon_id'::uuid and action = 'replaced' and reason = 'manual customer support replacement'), 'manual_replacement_must_version_code_and_audit_reason');

create extension if not exists dblink;
select dblink_connect('coupon_lock', current_setting('app.disposable_dblink_connection'));
select dblink_exec('coupon_lock', 'begin');
select dblink_exec('coupon_lock', 'do $lock$ begin perform pg_advisory_xact_lock(hashtextextended(''coupon-code:SAVE50'', 0)); end $lock$');
select pg_temp.assert_true(not pg_try_advisory_xact_lock(hashtextextended('coupon-code:SAVE50', 0)) and pg_get_functiondef('public.quote_coupon_checkout(uuid[],text,text,text,bigint,text)'::regprocedure) like '%coupon-identity:%', 'coupon_and_identity_locks_must_bound_concurrency');
select dblink_exec('coupon_lock', 'rollback'); select dblink_disconnect('coupon_lock');

do $acl$
declare v_role text; v_table text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_role);
    foreach v_table in array array['coupon_definitions', 'coupon_versions', 'coupon_identity_uses', 'coupon_audit_events'] loop begin execute format('select 1 from public.%I', v_table); raise exception '%_coupon_internal_read_allowed', v_role; exception when insufficient_privilege then null; end; end loop;
    begin perform public.quote_coupon_checkout(array[(select id from public.products where slug = 'coupon-coat')], 'SAVE50', 'v1', repeat('c', 64), 0, null); raise exception '%_coupon_quote_rpc_public', v_role; exception when insufficient_privilege then null; end;
  end loop;
end $acl$;
select '025_coupon_checkout_proof_passed' as result;
