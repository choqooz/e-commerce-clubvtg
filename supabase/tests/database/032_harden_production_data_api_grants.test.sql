-- Run against a fresh disposable PostgreSQL 17 database after all migrations.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

begin;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'P0001', message = p_case;
  end if;
end;
$assert$;

create function pg_temp.assert_select_denied(p_role text, p_relation text) returns void language plpgsql as $denied$
begin
  execute format('set local role %I', p_role);
  begin
    execute format('select 1 from %s limit 1', p_relation);
    raise exception using errcode = 'P0001', message = format('%s_can_read_%s', p_role, p_relation);
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$denied$;

create function pg_temp.assert_select_allowed(p_role text, p_relation text) returns void language plpgsql as $allowed$
begin
  execute format('set local role %I', p_role);
  execute format('select 1 from %s limit 1', p_relation);
  execute 'reset role';
end;
$allowed$;

grant all privileges on table
  public.credit_purchase_intents,
  public.integrity_audit,
  public.integrity_quarantine,
  public.inventory_reservations,
  public.payment_claims,
  public.payment_events,
  public.payment_manual_reviews
to anon, authenticated;

with client_roles(role_name) as (
  values ('anon'), ('authenticated')
), internal_tables(relation_name) as (
  values
    ('public.credit_purchase_intents'),
    ('public.integrity_audit'),
    ('public.integrity_quarantine'),
    ('public.inventory_reservations'),
    ('public.payment_claims'),
    ('public.payment_events'),
    ('public.payment_manual_reviews')
), table_privileges(privilege_name) as (
  values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger'), ('maintain')
)
select pg_temp.assert_true(
  not exists (
    select 1
    from client_roles
    cross join internal_tables
    cross join table_privileges
    where not has_table_privilege(role_name, relation_name, privilege_name)
  ),
  'internal_data_api_table_privilege_precondition_missing'
);

-- This psql include re-runs the exact production migration after the grants above.
\ir ../../migrations/20260910021122_harden_production_data_api_grants.sql

with client_roles(role_name) as (
  values ('anon'), ('authenticated')
), internal_tables(relation_name) as (
  values
    ('public.credit_purchase_intents'),
    ('public.integrity_audit'),
    ('public.integrity_quarantine'),
    ('public.inventory_reservations'),
    ('public.payment_claims'),
    ('public.payment_events'),
    ('public.payment_manual_reviews')
), table_privileges(privilege_name) as (
  values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger'), ('maintain')
)
select pg_temp.assert_true(
  not exists (
    select 1
    from client_roles
    cross join internal_tables
    cross join table_privileges
    where has_table_privilege(role_name, relation_name, privilege_name)
  ),
  'internal_data_api_table_privilege_present'
);

select pg_temp.assert_select_denied(role_name, relation_name)
from (values
  ('anon', 'public.credit_purchase_intents'),
  ('anon', 'public.integrity_audit'),
  ('anon', 'public.integrity_quarantine'),
  ('anon', 'public.inventory_reservations'),
  ('anon', 'public.payment_claims'),
  ('anon', 'public.payment_events'),
  ('anon', 'public.payment_manual_reviews'),
  ('authenticated', 'public.credit_purchase_intents'),
  ('authenticated', 'public.integrity_audit'),
  ('authenticated', 'public.integrity_quarantine'),
  ('authenticated', 'public.inventory_reservations'),
  ('authenticated', 'public.payment_claims'),
  ('authenticated', 'public.payment_events'),
  ('authenticated', 'public.payment_manual_reviews')
) as denied_reads(role_name, relation_name);

select pg_temp.assert_true(
  has_table_privilege('anon', 'public.catalog_product_prices', 'select')
  and has_table_privilege('authenticated', 'public.catalog_product_prices', 'select'),
  'catalog_product_prices_public_read_grant_missing'
);

select pg_temp.assert_select_allowed('anon', 'public.catalog_product_prices');
select pg_temp.assert_select_allowed('authenticated', 'public.catalog_product_prices');
select '032_production_data_api_grants_proof_passed' as result;

rollback;
