-- Runtime privilege proof, NOT an offline SQL parser test.
-- Run only in the disposable runner after the public_catalog_type_names migration.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

begin;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void
language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'P0001', message = p_case;
  end if;
end;
$assert$;

-- SECURITY INVOKER: exercise the actual role, not a privileged test bypass.
create function pg_temp.assert_denied(p_role text, p_statement text, p_case text) returns void
language plpgsql as $denied$
begin
  execute format('set local role %I', p_role);
  begin
    execute p_statement;
    raise exception using errcode = 'P0001', message = p_role || '_' || p_case;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$denied$;

create function pg_temp.assert_visible_names(p_role text) returns void
language plpgsql as $visible$
declare v_names text[];
begin
  execute format('set local role %I', p_role);
  select array_agg(name order by name) into v_names from public.product_types;
  execute 'reset role';
  perform pg_temp.assert_true(
    'Catalog proof — empty' = any(v_names), p_role || '_active_empty_type_name_missing'
  );
  perform pg_temp.assert_true(
    not ('Catalog proof — disabled' = any(v_names)), p_role || '_inactive_type_name_exposed'
  );
  perform pg_temp.assert_true(
    v_names = (select array_agg(name order by name) from public.product_types where is_active = true),
    p_role || '_active_master_names_mismatch'
  );
end;
$visible$;

create temporary table catalog_products_before as
select coalesce(jsonb_agg(to_jsonb(products) order by id), '[]'::jsonb) as rows
from public.products;

insert into public.product_types (name) values
  ('Catalog proof — empty'), ('Catalog proof — disabled');

-- Admin-disabled types must stay private; exercise the existing service RPC.
set role service_role;
select public.create_product_taxonomy_type('Catalog proof — service');
reset role;
select id as disabled_type_id from public.product_types where name = 'Catalog proof — disabled' \gset
select id as service_type_id from public.product_types where name = 'Catalog proof — service' \gset
set role service_role;
select public.set_product_taxonomy_active('type', :'disabled_type_id'::uuid, false);
select public.create_product_taxonomy_subtype(:'service_type_id'::uuid, 'Catalog proof — subtype');
reset role;
select id as service_subtype_id from public.product_subtypes where name = 'Catalog proof — subtype' \gset
set role service_role;
select public.set_product_taxonomy_active('subtype', :'service_subtype_id'::uuid, false);
reset role;

select pg_temp.assert_true(
  not exists (
    select 1 from public.products
    where product_type_id = (select id from public.product_types where name = 'Catalog proof — empty')
  ),
  'active_empty_type_fixture_must_have_zero_products'
);
select pg_temp.assert_true(
  (select not is_active from public.product_types where name = 'Catalog proof — disabled')
  and (select not is_active from public.product_subtypes where name = 'Catalog proof — subtype'),
  'admin_service_deactivation_contract_retained'
);
select pg_temp.assert_visible_names('anon');
select pg_temp.assert_visible_names('authenticated');

-- Check effective privileges, including inherited PUBLIC access and column ACLs.
with roles(role_name) as (values ('anon'), ('authenticated')),
privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
)
select pg_temp.assert_true(
  not exists (
    select 1 from roles cross join privileges
    where has_table_privilege(role_name, 'public.product_types', privilege_name)
       or has_table_privilege(role_name, 'public.product_subtypes', privilege_name)
  ),
  'no_public_whole_table_privileges'
);

with roles(role_name) as (values ('anon'), ('authenticated')),
privileges(privilege_name) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES'))
select pg_temp.assert_true(
  not exists (
    select 1 from roles cross join privileges
    cross join pg_attribute as columns
    where columns.attrelid in ('public.product_types'::regclass, 'public.product_subtypes'::regclass)
      and columns.attnum > 0 and not columns.attisdropped
      and has_column_privilege(role_name, columns.attrelid, columns.attnum, privilege_name)
          is distinct from (columns.attrelid = 'public.product_types'::regclass
                           and columns.attname = 'name' and privilege_name = 'SELECT')
  ),
  'only_name_column_select_allowed'
);

select pg_temp.assert_true(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.product_types'::regclass, 'public.product_subtypes'::regclass))
  and exists (
    select 1 from pg_policy
    where polrelid = 'public.product_types'::regclass and polname = 'public_catalog_type_names'
      and polcmd = 'r' and polwithcheck is null
      and polroles @> array['anon'::regrole::oid, 'authenticated'::regrole::oid]
      and cardinality(polroles) = 2
      and pg_get_expr(polqual, polrelid) = '(is_active = true)'
  ),
  'role_limited_select_policy_and_rls_retained'
);

select pg_temp.assert_denied(role_name, statement, case_name)
from (values ('anon'), ('authenticated')) as roles(role_name)
cross join (values
  ('select id from public.product_types', 'private_id_read_denied'),
  ('select created_at from public.product_types', 'private_timestamp_read_denied'),
  ('select is_active from public.product_types', 'private_activity_read_denied'),
  ('select * from public.product_types', 'full_row_read_denied'),
  ('select name from public.product_types where is_active', 'private_activity_filter_denied'),
  ('select name from public.product_subtypes', 'subtype_name_read_denied'),
  ('select * from public.product_subtypes', 'subtype_full_row_read_denied'),
  ('insert into public.product_types (name) values (''Unauthorized type'')', 'type_insert_denied'),
  ('update public.product_types set name = ''Unauthorized type''', 'type_update_denied'),
  ('delete from public.product_types', 'type_delete_denied'),
  ('insert into public.product_subtypes (product_type_id, name) values (gen_random_uuid(), ''Unauthorized subtype'')', 'subtype_insert_denied'),
  ('update public.product_subtypes set name = ''Unauthorized subtype''', 'subtype_update_denied'),
  ('delete from public.product_subtypes', 'subtype_delete_denied'),
  ('select public.create_product_taxonomy_type(''Unauthorized RPC type'')', 'create_type_rpc_denied'),
  ('select public.create_product_taxonomy_subtype(gen_random_uuid(), ''Unauthorized RPC subtype'')', 'create_subtype_rpc_denied'),
  ('select public.set_product_taxonomy_active(''type'', gen_random_uuid(), false)', 'set_active_rpc_denied')
) as cases(statement, case_name);

with functions(signature) as (values
  ('public.create_product_taxonomy_type(text)'),
  ('public.create_product_taxonomy_subtype(uuid,text)'),
  ('public.set_product_taxonomy_active(text,uuid,boolean)')
)
select pg_temp.assert_true(
  (select bool_and(
    has_function_privilege('service_role', signature, 'EXECUTE')
    and has_function_privilege('postgres', signature, 'EXECUTE')
    and not has_function_privilege('anon', signature, 'EXECUTE')
    and not has_function_privilege('authenticated', signature, 'EXECUTE')
  ) from functions),
  'admin_service_function_grants_retained'
);

set role service_role;
do $admin_errors$
begin
  begin
    perform public.set_product_taxonomy_active('invalid', gen_random_uuid(), false);
    raise exception 'invalid_kind_contract_missing';
  exception when raise_exception then
    if sqlerrm <> 'invalid_taxonomy_kind' then raise; end if;
  end;
  begin
    perform public.set_product_taxonomy_active('type', gen_random_uuid(), false);
    raise exception 'not_found_contract_missing';
  exception when raise_exception then
    if sqlerrm <> 'taxonomy_not_found' then raise; end if;
  end;
end;
$admin_errors$;
reset role;

select pg_temp.assert_true(
  (select rows from catalog_products_before) =
    (select coalesce(jsonb_agg(to_jsonb(products) order by id), '[]'::jsonb) from public.products),
  'products_and_history_unchanged'
);
select 'public_catalog_type_names_proof_passed' as result;
rollback;
