-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–023.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void
language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if;
end;
$assert$;

\if :{?pre_taxonomy}
insert into public.products (title, slug, price, category, subcategory)
values ('Taxonomy legacy fixture', 'taxonomy-legacy-fixture', 100, 'Outerwear', 'Coats');
insert into public.products (title, slug, price, category)
values ('Taxonomy type-only fixture', 'taxonomy-type-only-fixture', 100, 'Accessories');
select '023_pre_taxonomy_fixture_ready' as result;
\quit
\endif

select pg_temp.assert_true(
  (select product_type_id is not null and product_subtype_id is not null
   from public.products where slug = 'taxonomy-legacy-fixture')
  and (select product_type_id is not null and product_subtype_id is null
       from public.products where slug = 'taxonomy-type-only-fixture')
  and exists (select 1 from public.product_types where name = 'Outerwear')
  and exists (select 1 from public.product_subtypes where name = 'Coats'),
  'legacy_products_must_map_with_optional_subtype'
);

do $unique$
begin
  begin insert into public.product_types (name) values ('outerwear'); raise exception 'case_insensitive_type_uniqueness_missing';
  exception when unique_violation then null; end;
  begin insert into public.product_subtypes (product_type_id, name)
    select id, 'coats' from public.product_types where name = 'Outerwear'; raise exception 'parent_scoped_subtype_uniqueness_missing';
  exception when unique_violation then null; end;
end;
$unique$;

insert into public.product_types (name) values ('Tops');
insert into public.product_subtypes (product_type_id, name)
select id, 'Shirts' from public.product_types where name = 'Tops';
do $composite$
begin
  insert into public.products (title, slug, price, category, product_type_id)
  select 'Valid type only', 'valid-type-only', 100, 'Outerwear', id
  from public.product_types where name = 'Outerwear';
  begin
    insert into public.products (title, slug, price, category, product_type_id, product_subtype_id)
    select 'Invalid hierarchy', 'invalid-taxonomy-pair', 100, 'Outerwear', types.id, subtypes.id
    from public.product_types as types
    join public.product_subtypes as subtypes on subtypes.name = 'Shirts'
    where types.name = 'Outerwear';
    raise exception 'mismatched_type_subtype_pair_allowed';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.products (title, slug, price, category, product_subtype_id)
    select 'Subtype without type', 'subtype-without-type', 100, 'Outerwear', id
    from public.product_subtypes where name = 'Coats';
    raise exception 'subtype_without_type_allowed';
  exception when check_violation then null; end;
end;
$composite$;

select pg_temp.assert_true(
  (select product_type_id is not null and product_subtype_id is null
   from public.products where slug = 'valid-type-only'),
  'type_only_product_must_be_valid'
);

insert into public.products (title, slug, price, category)
values ('Taxonomy nullable fixture', 'taxonomy-nullable-fixture', 100, 'Legacy');
select pg_temp.assert_true(
  (select product_type_id is null and product_subtype_id is null
   from public.products where slug = 'taxonomy-nullable-fixture'),
  'nullable_product_taxonomy_references_must_remain_supported'
);

do $referenced$
declare v_subtype uuid;
begin
  select product_subtype_id into v_subtype from public.products where slug = 'taxonomy-legacy-fixture';
  begin delete from public.product_subtypes where id = v_subtype; raise exception 'referenced_subtype_delete_allowed';
  exception when foreign_key_violation then null; end;
  begin delete from public.product_types where id = (select product_type_id from public.products where slug = 'taxonomy-legacy-fixture'); raise exception 'referenced_type_delete_allowed';
  exception when foreign_key_violation then null; end;
end;
$referenced$;

select public.set_product_taxonomy_active(
  'subtype', (select product_subtype_id from public.products where slug = 'taxonomy-legacy-fixture'), false
);
select pg_temp.assert_true(
  (select not is_active from public.product_subtypes where name = 'Coats')
  and (select count(*) = 1 from public.products where slug = 'taxonomy-legacy-fixture'),
  'deactivation_must_hide_future_selection_without_removing_history'
);

do $acl$
begin
  begin
    set local role anon;
    perform 1 from public.product_types;
    raise exception 'anon_taxonomy_read_allowed';
  exception when insufficient_privilege then null; end;
  begin
    set local role anon;
    perform public.set_product_taxonomy_active('subtype', gen_random_uuid(), false);
    raise exception 'anon_taxonomy_rpc_allowed';
  exception when insufficient_privilege then null; end;
  begin
    set local role authenticated;
    insert into public.product_types (name) values ('Unauthorized');
    raise exception 'authenticated_taxonomy_write_allowed';
  exception when insufficient_privilege then null; end;
end;
$acl$;

set role service_role;
select public.create_product_taxonomy_type('Authorized RPC type');
reset role;

select '023_taxonomy_proof_passed' as result;
