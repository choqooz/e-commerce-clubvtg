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

with target_columns(relation, column_name) as (
  values
    ('public.orders'::regclass, 'id'::name),
    ('public.order_items'::regclass, 'id'::name)
)
select pg_temp.assert_true(
  not exists (
    select 1
    from target_columns
    where not exists (
      select 1
      from pg_catalog.pg_attribute attribute
      join pg_catalog.pg_attrdef default_expression
        on default_expression.adrelid = attribute.attrelid
       and default_expression.adnum = attribute.attnum
      where attribute.attrelid = target_columns.relation
        and attribute.attname = target_columns.column_name
        and not attribute.attisdropped
        and pg_get_expr(default_expression.adbin, default_expression.adrelid) = 'gen_random_uuid()'
    )
  ),
  'order_uuid_defaults_must_use_gen_random_uuid'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    where function.oid = to_regprocedure('public.uuid_generate_v4()')
      and obj_description(function.oid, 'pg_proc') = 'e-commerce-clubvtg temporary UUID compatibility wrapper'
  ),
  'marked_uuid_compatibility_wrapper_must_be_absent'
);

create temp table generated_orders as
with inserted as (
  insert into public.orders (customer_email, customer_name, total_amount)
  values
    ('uuid-compatibility-one@example.invalid', 'UUID Compatibility One', 1),
    ('uuid-compatibility-two@example.invalid', 'UUID Compatibility Two', 1)
  returning id
)
select id from inserted;

create temp table generated_order_items as
with inserted as (
  insert into public.order_items (order_id, price)
  select id, 1 from generated_orders
  returning id
)
select id from inserted;

select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct id) = 2 and bool_and(id is not null) from generated_orders)
  and (select count(*) = 2 and count(distinct id) = 2 and bool_and(id is not null) from generated_order_items),
  'order_uuid_defaults_must_generate_distinct_non_null_values'
);

select '033_orders_uuid_compatibility_proof_passed' as result;

rollback;
