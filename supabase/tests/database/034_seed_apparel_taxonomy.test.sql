-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–034.
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

\if :{?prepare_idempotency}
update public.product_types
set name = lower(name), is_active = false
where name = 'Remeras y tops';

update public.product_subtypes
set name = lower(name), is_active = false
where name = 'Remeras'
  and product_type_id = (
    select id from public.product_types where name = 'remeras y tops'
  );

select '034_apparel_taxonomy_idempotency_fixture_ready' as result;
\quit
\endif

create temporary table expected_product_types (
  name text primary key
);

insert into expected_product_types (name) values
  ('Remeras y tops'),
  ('Camisas y blusas'),
  ('Buzos y tejidos'),
  ('Abrigos'),
  ('Pantalones'),
  ('Shorts y polleras'),
  ('Vestidos y enteritos'),
  ('Conjuntos'),
  ('Calzado'),
  ('Accesorios');

create temporary table expected_product_subtypes (
  product_type_name text not null,
  name text not null,
  primary key (product_type_name, name)
);

insert into expected_product_subtypes (product_type_name, name) values
  ('Remeras y tops', 'Remeras'),
  ('Remeras y tops', 'Musculosas'),
  ('Remeras y tops', 'Tops'),
  ('Remeras y tops', 'Polos'),
  ('Remeras y tops', 'Manga larga'),
  ('Camisas y blusas', 'Camisas'),
  ('Camisas y blusas', 'Blusas'),
  ('Camisas y blusas', 'Sobrecamisas'),
  ('Camisas y blusas', 'Camisas de manga corta'),
  ('Buzos y tejidos', 'Hoodies'),
  ('Buzos y tejidos', 'Buzos'),
  ('Buzos y tejidos', 'Sweaters'),
  ('Buzos y tejidos', 'Cardigans'),
  ('Buzos y tejidos', 'Poleras'),
  ('Abrigos', 'Camperas'),
  ('Abrigos', 'Chaquetas'),
  ('Abrigos', 'Blazers'),
  ('Abrigos', 'Tapados'),
  ('Abrigos', 'Trenchs y pilotos'),
  ('Abrigos', 'Chalecos'),
  ('Pantalones', 'Jeans'),
  ('Pantalones', 'Pantalones cargo'),
  ('Pantalones', 'Pantalones de vestir'),
  ('Pantalones', 'Joggers'),
  ('Pantalones', 'Leggings'),
  ('Shorts y polleras', 'Shorts'),
  ('Shorts y polleras', 'Bermudas'),
  ('Shorts y polleras', 'Polleras'),
  ('Shorts y polleras', 'Minifaldas'),
  ('Shorts y polleras', 'Skorts'),
  ('Vestidos y enteritos', 'Vestidos cortos'),
  ('Vestidos y enteritos', 'Vestidos largos'),
  ('Vestidos y enteritos', 'Monos'),
  ('Vestidos y enteritos', 'Jardineros'),
  ('Conjuntos', 'Conjuntos deportivos'),
  ('Conjuntos', 'Conjuntos tejidos'),
  ('Conjuntos', 'Trajes'),
  ('Conjuntos', 'Sets de dos piezas'),
  ('Calzado', 'Zapatillas'),
  ('Calzado', 'Botas y borcegos'),
  ('Calzado', 'Zapatos'),
  ('Calzado', 'Mocasines'),
  ('Calzado', 'Sandalias'),
  ('Accesorios', 'Gorras y sombreros'),
  ('Accesorios', 'Carteras y bolsos'),
  ('Accesorios', 'Mochilas'),
  ('Accesorios', 'Cinturones'),
  ('Accesorios', 'Pañuelos y bufandas'),
  ('Accesorios', 'Anteojos'),
  ('Accesorios', 'Joyería'),
  ('Accesorios', 'Medias');

select pg_temp.assert_true(
  (select count(*) from expected_product_types) = 10
  and (select count(*) from expected_product_subtypes) = 51,
  'apparel_taxonomy_expected_membership_count_must_be_10_types_and_51_subtypes'
);

\if :{?post_idempotency}
select pg_temp.assert_true(
  (select count(*) from public.product_types) = 10
  and (select count(*) from public.product_subtypes) = 51
  and (select count(*) from public.product_types where is_active) = 9
  and (select count(*) from public.product_subtypes where is_active) = 50
  and (select count(*) from public.product_types as types join expected_product_types as expected on lower(types.name) = lower(expected.name)) = 10
  and (select count(*) from public.product_subtypes as subtypes join public.product_types as types on types.id = subtypes.product_type_id join expected_product_subtypes as expected on lower(types.name) = lower(expected.product_type_name) and lower(subtypes.name) = lower(expected.name)) = 51
  and exists (select 1 from public.product_types where name = 'remeras y tops' and not is_active)
  and exists (
    select 1
    from public.product_subtypes as subtypes
    join public.product_types as types on types.id = subtypes.product_type_id
    where types.name = 'remeras y tops' and subtypes.name = 'remeras' and not subtypes.is_active
  ),
  'apparel_taxonomy_rerun_must_be_case_insensitive_idempotent_without_reactivation'
);
\else
select pg_temp.assert_true(
  (select count(*) from public.product_types) = 10
  and (select count(*) from public.product_subtypes) = 51
  and (select count(*) from public.product_types where is_active) = 10
  and (select count(*) from public.product_subtypes where is_active) = 51
  and (select count(*) from public.product_types as types join expected_product_types as expected on types.name = expected.name) = 10
  and (select count(*) from public.product_subtypes as subtypes join public.product_types as types on types.id = subtypes.product_type_id join expected_product_subtypes as expected on types.name = expected.product_type_name and subtypes.name = expected.name) = 51,
  'apparel_taxonomy_must_have_exact_active_membership_and_hierarchy'
);
\endif

do $unique$
begin
  begin
    insert into public.product_types (name) values ('REMERAS Y TOPS');
    raise exception 'apparel_taxonomy_case_insensitive_type_uniqueness_missing';
  exception when unique_violation then null;
  end;

  begin
    insert into public.product_subtypes (product_type_id, name)
    select id, 'REMERAS' from public.product_types where lower(name) = 'remeras y tops';
    raise exception 'apparel_taxonomy_case_insensitive_subtype_uniqueness_missing';
  exception when unique_violation then null;
  end;
end;
$unique$;

select '034_seed_apparel_taxonomy_proof_passed' as result;
