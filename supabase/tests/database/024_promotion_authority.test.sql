-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–024.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if;
end;
$guard$;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if; end;
$assert$;

insert into public.product_types (name) values ('Promotion outerwear'), ('Promotion accessories');
insert into public.product_subtypes (product_type_id, name)
select id, 'Promotion coats' from public.product_types where name = 'Promotion outerwear';
insert into public.products (title, slug, price, category, product_type_id, product_subtype_id)
select 'Promotion coat', 'promotion-coat', 1000, 'Outerwear', types.id, subtypes.id
from public.product_types types join public.product_subtypes subtypes on subtypes.product_type_id = types.id
where types.name = 'Promotion outerwear';
insert into public.products (title, slug, price, category, product_type_id)
select 'Promotion accessory', 'promotion-accessory', 2000, 'Accessories', id
from public.product_types where name = 'Promotion accessories';
insert into public.product_types (name) values ('Promotion shoes');
select id as outerwear_type_id from public.product_types where name = 'Promotion outerwear' \gset
select id as coats_subtype_id from public.product_subtypes where name = 'Promotion coats' \gset
select id as accessories_type_id from public.product_types where name = 'Promotion accessories' \gset
select id as shoes_type_id from public.product_types where name = 'Promotion shoes' \gset

set role service_role;
select public.create_promotion(
  'user_admin', 5000, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour',
  jsonb_build_array(
    jsonb_build_object('product_type_id', :'outerwear_type_id'::uuid, 'product_subtype_id', :'coats_subtype_id'::uuid),
    jsonb_build_object('product_type_id', :'accessories_type_id'::uuid, 'product_subtype_id', null)
  )
) as promotion_id \gset
reset role;
set role service_role;
select public.create_promotion('user_admin', 1000, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', jsonb_build_array(jsonb_build_object('product_type_id', :'shoes_type_id'::uuid, 'product_subtype_id', null)));
reset role;

select pg_temp.assert_true(
  (select current_price = 500 and base_price = 1000 and promotion_percent = 50 and promotion_ends_at > statement_timestamp()
   from public.catalog_product_prices where slug = 'promotion-coat')
  and (select current_price = 1000 and promotion_percent = 50 from public.catalog_product_prices where slug = 'promotion-accessory')
  and (select count(*) = 2 from public.promotion_campaigns where is_active),
  'database_time_projection_must_apply_percentage_only_without_shipping'
);
select pg_temp.assert_true(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'promotion_campaigns' and column_name ilike '%fixed%')
  and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'catalog_product_prices' and column_name ilike '%shipping%'),
  'promotion_authority_must_not_have_fixed_or_shipping_paths'
);

do $constraints$
begin
  begin perform public.create_promotion('user_admin', 5001, statement_timestamp(), statement_timestamp() + interval '1 hour', '[]'); raise exception 'percentage_cap_missing';
  exception when check_violation then null; end;
  begin perform public.create_promotion('user_admin', 1000, statement_timestamp(), statement_timestamp() + interval '1 hour', jsonb_build_array(jsonb_build_object('product_type_id', (select id from public.product_types where name = 'Promotion outerwear'), 'product_subtype_id', null))); raise exception 'ancestor_overlap_allowed';
  exception when others then if sqlerrm <> 'promotion_target_overlap' then raise; end if; end;
  begin perform public.create_promotion('user_admin', 1000, statement_timestamp(), statement_timestamp() + interval '1 hour', jsonb_build_array(jsonb_build_object('product_type_id', (select id from public.product_types where name = 'Promotion outerwear'), 'product_subtype_id', (select id from public.product_subtypes where name = 'Promotion coats')))); raise exception 'identical_target_overlap_allowed'; exception when others then if sqlerrm <> 'promotion_target_overlap' then raise; end if; end;
  begin set local role authenticated; insert into public.promotion_campaigns (discount_bps, starts_at, ends_at) values (1000, statement_timestamp(), statement_timestamp() + interval '1 hour'); raise exception 'direct_campaign_write_allowed';
  exception when insufficient_privilege then null; end;
end;
$constraints$;

select pg_temp.assert_true(
  (select prosrc like '%pg_advisory_xact_lock%' from pg_proc where proname = 'create_promotion')
  and pg_get_functiondef('private.catalog_product_prices()'::regprocedure) like '%ends_at > pg_catalog.statement_timestamp()%'
  and not exists (select 1 from public.catalog_product_prices where slug = 'promotion-coat' and promotion_ends_at <= statement_timestamp()),
  'advisory_lock_and_utc_end_exclusivity_must_be_enforced'
);
create extension if not exists dblink;
select dblink_connect('promotion_lock', current_setting('app.disposable_dblink_connection'));
select dblink_exec('promotion_lock', 'begin');
select dblink_exec('promotion_lock', 'do $lock$ begin perform pg_advisory_xact_lock(hashtextextended(''promotion-type:' || :'accessories_type_id' || ''', 0)); end $lock$;');
select pg_temp.assert_true(not pg_try_advisory_xact_lock(hashtextextended('promotion-type:' || :'accessories_type_id', 0)), 'promotion_type_advisory_lock_must_serialize');
select dblink_exec('promotion_lock', 'rollback');
select dblink_disconnect('promotion_lock');

do $immutability$
begin
  begin update public.promotion_campaigns set discount_bps = 1000 where id = (select id from public.promotion_campaigns limit 1); raise exception 'economic_terms_mutable';
  exception when others then if sqlerrm <> 'promotion_terms_immutable' then raise; end if; end;
  begin update public.promotion_versions set discount_bps = 1000 where promotion_id = (select id from public.promotion_campaigns limit 1); raise exception 'version_mutable';
  exception when others then if sqlerrm <> 'promotion_version_immutable' then raise; end if; end;
end;
$immutability$;

set role service_role;
select public.end_promotion_early('user_admin', :'promotion_id'::uuid, 'inventory correction');
reset role;
select pg_temp.assert_true(
  (select not is_active and ended_at is not null and ended_reason = 'inventory correction' from public.promotion_campaigns where id = :'promotion_id'::uuid)
  and (select actor = 'user_admin' and reason = 'inventory correction' and before_state ? 'is_active' and after_state ? 'is_active' from public.promotion_audit_events where promotion_id = :'promotion_id'::uuid and action = 'ended_early'),
  'early_end_must_require_reason_and_write_immutable_audit'
);

set role service_role; select public.create_promotion('user_admin', 5000, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', jsonb_build_array(jsonb_build_object('product_type_id', :'outerwear_type_id'::uuid, 'product_subtype_id', :'coats_subtype_id'::uuid))); reset role;
do $acl$
declare v_role text; v_table text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_role);
    foreach v_table in array array['promotion_campaigns', 'promotion_versions', 'promotion_targets', 'promotion_audit_events'] loop begin execute format('select 1 from public.%I', v_table); raise exception '%_promotion_read_allowed', v_role; exception when insufficient_privilege then null; end; end loop;
    if not (select current_price = 500 and base_price = 1000 and promotion_percent = 50 and promotion_ends_at > statement_timestamp() from public.catalog_product_prices where slug = 'promotion-coat') then
      raise exception '%_catalog_projection_unavailable', v_role;
    end if;
  end loop;
  reset role;
  begin set local role authenticated; perform public.create_promotion('user', 1000, statement_timestamp(), statement_timestamp() + interval '1 hour', '[]'); raise exception 'public_promotion_rpc_allowed'; exception when insufficient_privilege then null; end;
end;
$acl$;

select '024_promotion_authority_proof_passed' as result;
