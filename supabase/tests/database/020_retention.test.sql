-- Run only against a fresh disposable database seeded with deployed-shape
-- migrations 015–017 authority functions, triggers, and the exact migration-015
-- orders_integrity_v1_authority_check before migration 020 is installed.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true'
    or current_setting('app.retention_predecessor_fixture', true) is distinct from 'true' then
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

\if :{?predecessor_fixture_only}
select pg_temp.assert_true(
  exists (
    select 1
    from pg_constraint as constraints
    where constraints.conrelid = 'public.orders'::regclass
      and constraints.conname = 'orders_integrity_v1_authority_check'
      and constraints.contype = 'c'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'integrity_version = 0'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'integrity_version = 1'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'user_id IS NOT NULL'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'purchase_user_id = user_id'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'payment_amount IS NOT NULL'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'payment_amount >='
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'payment_expires_at IS NOT NULL'
  ),
  'migration_015_orders_integrity_v1_authority_check_fixture_missing'
);
select '020_retention_predecessor_fixture_ready' as result;
\quit
\endif

-- RED catalog assertion: this column is absent before migration 020 is installed.
select pg_temp.assert_true(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'clerk_anonymized_at'
  ),
  'orders_clerk_anonymized_at_missing'
);

select pg_temp.assert_true(
  to_regprocedure('public.prevent_order_checkout_authority_mutation()') is not null
  and to_regprocedure('public.prevent_credit_purchase_intent_authority_mutation()') is not null
  and exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'orders_checkout_authority_immutable')
  and exists (select 1 from pg_trigger where tgrelid = 'public.credit_purchase_intents'::regclass and tgname = 'credit_purchase_intent_authority_immutable'),
  'predecessor_immutable_authority_fixture_missing'
);

select pg_temp.assert_true(
  to_regprocedure('public.anonymize_clerk_user(text)') is null,
  'unfinished_anonymization_consumer_was_activated'
);

select pg_temp.assert_true(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.orders'::regclass, 'public.credit_transactions'::regclass, 'public.credit_purchase_intents'::regclass
  ))
  and not has_function_privilege('anon', 'public.enforce_clerk_financial_anonymization()'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_clerk_financial_anonymization()'::regprocedure, 'execute')
  and not has_function_privilege('service_role', 'public.enforce_clerk_financial_anonymization()'::regprocedure, 'execute'),
  'retention_security_or_acl_contract_missing'
);

insert into public.profiles (id, email) values ('user_020_retained', 'retained@example.invalid');
insert into public.orders (
  id, user_id, purchase_user_id, customer_email, customer_name, shipping_info, tracking_number,
  status, total_amount, shipping_fee, mp_preference_id, mp_payment_id, integrity_version,
  payment_amount, payment_currency, payment_reference, payment_expires_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000020', 'user_020_retained', 'user_020_retained',
  'retained@example.invalid', 'Retained Person', '{"street":"Private Street"}',
  'TRACK-020', 'paid', 12000, 700, 'pref_020', 'payment_020', 1,
  12000, 'ARS', 'order:00000000-0000-0000-0000-000000000020', '2026-01-02T03:20:00Z',
  '2026-01-02T03:04:05Z', '2026-01-02T03:04:06Z'
);
insert into public.credit_transactions (id, user_id, amount, reason, mp_payment_id, created_at)
values ('00000000-0000-0000-0000-000000000021', 'user_020_retained', 12, 'mp_credit_settlement', 'payment_020', '2026-01-02T03:04:07Z');
insert into public.credit_purchase_intents (
  id, user_id, pack_id, amount, currency, credits, reference, expires_at, preference_id,
  status, mp_payment_id, created_at, applied_at
) values (
  '00000000-0000-0000-0000-000000000022', 'user_020_retained', 'popular', 12000, 'ARS', 12,
  'credit:020', '2026-01-02T03:19:00Z', 'pref_020', 'applied', 'payment_020',
  '2026-01-02T03:04:08Z', '2026-01-02T03:04:09Z'
);

create temp table retained_bytes (kind text primary key, payload bytea not null);
insert into retained_bytes
select 'order', convert_to(concat_ws('|', id, integrity_version, status, total_amount, shipping_fee, mp_preference_id, mp_payment_id, payment_amount, payment_currency, payment_reference, payment_expires_at, created_at, updated_at), 'UTF8')
from public.orders where id = '00000000-0000-0000-0000-000000000020';
insert into retained_bytes
select 'credit_transaction', convert_to(concat_ws('|', id, amount, reason, mp_payment_id, created_at), 'UTF8')
from public.credit_transactions where id = '00000000-0000-0000-0000-000000000021';
insert into retained_bytes
select 'credit_purchase_intent', convert_to(concat_ws('|', id, pack_id, amount, currency, credits, reference, expires_at, preference_id, status, mp_payment_id, created_at, applied_at), 'UTF8')
from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000022';

update public.orders
set user_id = null, purchase_user_id = null, customer_email = null, customer_name = null,
    shipping_info = null, tracking_number = null, clerk_anonymized_at = '2026-02-03T04:05:06Z'
where id = '00000000-0000-0000-0000-000000000020';
update public.credit_transactions
set user_id = null, clerk_anonymized_at = '2026-02-03T04:05:06Z'
where id = '00000000-0000-0000-0000-000000000021';
update public.credit_purchase_intents
set user_id = null, clerk_anonymized_at = '2026-02-03T04:05:06Z'
where id = '00000000-0000-0000-0000-000000000022';

select pg_temp.assert_true(
  (select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'credit_transactions' and column_name = 'user_id')
  and (select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'credit_purchase_intents' and column_name = 'user_id')
  and (select count(*) = 2 from pg_constraint where contype = 'f' and confrelid = 'public.profiles'::regclass and confdeltype = 'n'
       and conrelid in ('public.credit_transactions'::regclass, 'public.credit_purchase_intents'::regclass)),
  'nullable_retained_identity_foreign_keys_missing'
);

select pg_temp.assert_true(
  (select user_id is null and purchase_user_id is null and customer_email is null
     and customer_name is null and shipping_info is null and tracking_number is null
     and clerk_anonymized_at is not null from public.orders where id = '00000000-0000-0000-0000-000000000020')
  and (select user_id is null and clerk_anonymized_at is not null from public.credit_transactions where id = '00000000-0000-0000-0000-000000000021')
  and (select user_id is null and clerk_anonymized_at is not null from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000022'),
  'financial_pii_or_identity_link_was_retained'
);

select pg_temp.assert_true(
  exists (
    select 1
    from pg_constraint as constraints
    where constraints.conrelid = 'public.orders'::regclass
      and constraints.conname = 'orders_integrity_v1_authority_check'
      and constraints.contype = 'c'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'clerk_anonymized_at IS NOT NULL'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'customer_email IS NULL'
      and pg_catalog.pg_get_expr(constraints.conbin, constraints.conrelid) ~ 'tracking_number IS NULL'
  ),
  'orders_integrity_v1_anonymized_state_contract_missing'
);

select pg_temp.assert_true(
  (select payload from retained_bytes where kind = 'order') = (
    select convert_to(concat_ws('|', id, integrity_version, status, total_amount, shipping_fee, mp_preference_id, mp_payment_id, payment_amount, payment_currency, payment_reference, payment_expires_at, created_at, updated_at), 'UTF8')
    from public.orders where id = '00000000-0000-0000-0000-000000000020'
  ) and (select payload from retained_bytes where kind = 'credit_transaction') = (
    select convert_to(concat_ws('|', id, amount, reason, mp_payment_id, created_at), 'UTF8')
    from public.credit_transactions where id = '00000000-0000-0000-0000-000000000021'
  ) and (select payload from retained_bytes where kind = 'credit_purchase_intent') = (
    select convert_to(concat_ws('|', id, pack_id, amount, currency, credits, reference, expires_at, preference_id, status, mp_payment_id, created_at, applied_at), 'UTF8')
    from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000022'
  ),
  'retained_financial_facts_were_not_byte_stable'
);

do $invariants$
declare
  v_table text;
  v_id uuid;
begin
  begin
    update public.orders set user_id = null where id = '00000000-0000-0000-0000-000000000024';
    raise exception 'unmarked_identity_detachment_was_accepted';
  exception when raise_exception then
    if sqlerrm = 'unmarked_identity_detachment_was_accepted' then raise; end if;
  end;
  begin
    update public.orders set clerk_anonymized_at = null where id = '00000000-0000-0000-0000-000000000020';
    raise exception 'anonymization_marker_was_reversible';
  exception when raise_exception then
    if sqlerrm = 'anonymization_marker_was_reversible' then raise; end if;
  end;
  begin
    update public.orders set customer_email = 'rehydrated@example.invalid' where id = '00000000-0000-0000-0000-000000000020';
    raise exception 'anonymized_pii_was_rehydratable';
  exception when raise_exception then
    if sqlerrm = 'anonymized_pii_was_rehydratable' then raise; end if;
  end;
  begin
    update public.orders set status = 'shipped' where id = '00000000-0000-0000-0000-000000000020';
    raise exception 'retained_financial_fact_was_mutable';
  exception when raise_exception then
    if sqlerrm = 'retained_financial_fact_was_mutable' then raise; end if;
  end;
  begin
    insert into public.credit_purchase_intents (id, user_id, pack_id, amount, currency, credits, reference, expires_at, status, created_at)
    values ('00000000-0000-0000-0000-000000000023', 'user_020_missing', 'basic', 1, 'ARS', 1, 'credit:missing', '2026-01-02T03:19:00Z', 'pending', '2026-01-02T03:04:10Z');
    raise exception 'non_null_dangling_identity_was_accepted';
  exception when foreign_key_violation then
    null;
  end;

  foreach v_table in array array['credit_transactions', 'credit_purchase_intents'] loop
    v_id := case v_table when 'credit_transactions' then '00000000-0000-0000-0000-000000000021'::uuid else '00000000-0000-0000-0000-000000000022'::uuid end;
    begin execute format('update public.%I set clerk_anonymized_at = null where id = %L', v_table, v_id); raise exception 'credit_marker_was_reversible';
    exception when raise_exception then if sqlerrm = 'credit_marker_was_reversible' then raise; end if; end;
    begin execute format('update public.%I set user_id = %L where id = %L', v_table, 'user_020_retained', v_id); raise exception 'credit_identity_was_rehydratable';
    exception when raise_exception then if sqlerrm = 'credit_identity_was_rehydratable' then raise; end if; end;
    begin execute format('update public.%I set amount = 99 where id = %L', v_table, v_id); raise exception 'credit_fact_was_mutable';
    exception when raise_exception then if sqlerrm = 'credit_fact_was_mutable' then raise; end if; end;
  end loop;
end;
$invariants$;

delete from public.profiles where id = 'user_020_retained';
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = 'user_020_retained')
  and exists (select 1 from public.orders where id = '00000000-0000-0000-0000-000000000020')
  and (select user_id is null from public.credit_transactions where id = '00000000-0000-0000-0000-000000000021')
  and (select user_id is null from public.credit_purchase_intents where id = '00000000-0000-0000-0000-000000000022'),
  'marked_financial_history_was_not_retained_after_profile_delete'
);

select '020_retention_proof_passed' as result;
