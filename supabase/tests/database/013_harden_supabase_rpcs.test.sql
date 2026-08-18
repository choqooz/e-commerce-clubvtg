-- PR 2 GREEN harness: run only against a disposable database after 013.
-- It ROLLBACKs all fixtures and requires the disposable guard setting.
-- PGOPTIONS='-c app.disposable_test=true' psql "$DISPOSABLE_DB_URL" \
--   -v ON_ERROR_STOP=1 -f supabase/tests/database/013_harden_supabase_rpcs.test.sql

begin;

do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

create temp table green_evidence (case_name text primary key, finding text not null) on commit drop;
create temp table behavior_evidence (
  case_name text primary key,
  finding text not null,
  credit_delta integer not null default 0,
  log_delta integer not null default 0,
  transaction_delta integer not null default 0
) on commit drop;

-- GREEN CATALOG ASSERTIONS.
with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into green_evidence
select 'exact_signatures_present', format('found %s target signatures', count(*))
from targets having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into green_evidence
select 'empty_function_local_search_path', string_agg(function_oid::text, ', ')
from targets join pg_proc functions on functions.oid = targets.function_oid
where exists (
  select 1 from unnest(coalesce(functions.proconfig, '{}'::text[])) setting_name
  where setting_name in ('search_path=', 'search_path=""')
)
having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into green_evidence
select 'only_internal_roles_execute', string_agg(function_oid::text, ', ')
from targets
where not has_function_privilege('anon', function_oid, 'EXECUTE')
  and not has_function_privilege('authenticated', function_oid, 'EXECUTE')
  and has_function_privilege('service_role', function_oid, 'EXECUTE')
  and has_function_privilege('postgres', function_oid, 'EXECUTE')
having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into green_evidence
select 'no_public_execute_acl', string_agg(function_oid::text, ', ')
from targets join pg_proc functions on functions.oid = targets.function_oid
where not exists (
  select 1
  from aclexplode(coalesce(functions.proacl, acldefault('f', functions.proowner))) public_acl
  where public_acl.grantee = 0 and public_acl.privilege_type = 'EXECUTE'
)
having count(*) = 3;

insert into green_evidence
select 'safe_postgres_function_defaults', 'postgres defaults deny PUBLIC and client execution'
where not exists (
  select 1
  from pg_default_acl defaults
  join pg_roles owner_role on owner_role.oid = defaults.defaclrole
  join pg_namespace namespace_name on namespace_name.oid = defaults.defaclnamespace
  cross join lateral aclexplode(defaults.defaclacl) acl
  where defaults.defaclobjtype = 'f'
    and owner_role.rolname = 'postgres'
    and namespace_name.nspname = 'public'
    and acl.privilege_type = 'EXECUTE'
    and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
);

insert into green_evidence
select 'trigger_helper_scope_unchanged', 'public.update_orders_updated_at() remains attached to its order trigger'
where to_regprocedure('public.update_orders_updated_at()') is not null
  and exists (
    select 1 from pg_trigger trigger_definition
    where trigger_definition.tgfoid = 'public.update_orders_updated_at()'::regprocedure
      and not trigger_definition.tgisinternal
  );

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into green_evidence
select 'postgres_definers_with_qualified_bodies', string_agg(function_oid::text, ', ')
from targets
join pg_proc functions on functions.oid = targets.function_oid
join pg_roles owners on owners.oid = functions.proowner
where functions.prosecdef and owners.rolname = 'postgres'
  and case function_oid::text
    when 'use_ai_credit(text,uuid,text)' then pg_get_functiondef(function_oid) like '%public.products%'
      and pg_get_functiondef(function_oid) like '%public.profiles%'
      and pg_get_functiondef(function_oid) like '%public.ai_tryon_logs%'
      and pg_get_functiondef(function_oid) like '%public.credit_transactions%'
    when 'refund_ai_credit(uuid)' then pg_get_functiondef(function_oid) like '%public.profiles%'
      and pg_get_functiondef(function_oid) like '%public.ai_tryon_logs%'
      and pg_get_functiondef(function_oid) like '%public.credit_transactions%'
    when 'increment_credits(text,integer)' then pg_get_functiondef(function_oid) like '%public.profiles%'
  end
having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into green_evidence
select 'only_service_role_and_postgres_direct_grants', string_agg(function_oid::text, ', ')
from targets join pg_proc functions on functions.oid = targets.function_oid
where not exists (
  select 1
  from aclexplode(coalesce(functions.proacl, acldefault('f', functions.proowner))) acl
  left join pg_roles grantees on grantees.oid = acl.grantee
  where acl.privilege_type = 'EXECUTE'
    and (acl.grantee = 0 or grantees.rolname not in ('service_role', 'postgres'))
)
having count(*) = 3;

insert into green_evidence
select 'existing_orders_rls_metadata_intact', '013 leaves prerequisite orders RLS metadata unchanged'
where (
  select count(*)
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relname in ('orders', 'order_items')
    and classes.relrowsecurity
) = 2;

-- BEHAVIOR-FIRST RED SCAFFOLDING. All fixtures and probes roll back below.
insert into public.profiles (id, email, credits) values
  ('user_red_valid', 'red-valid@example.invalid', 2),
  ('user_red_invalid_ref', 'red-invalid-ref@example.invalid', 2),
  ('user_red_insufficient', 'red-insufficient@example.invalid', 0),
  ('user_red_zero', 'red-zero@example.invalid', 5),
  ('user_red_negative', 'red-negative@example.invalid', 5),
  ('user_red_refund', 'red-refund@example.invalid', 0);
insert into public.products (id, title, slug, description, price, size, color, category, image_urls, status) values
  ('10000000-0000-0000-0000-000000000001', 'RED available product', 'red-available-product', 'fixture', 1, 'M', 'black', 'fixture', '{}', 'available'),
  ('10000000-0000-0000-0000-000000000002', 'RED sold product', 'red-sold-product', 'fixture', 1, 'M', 'black', 'fixture', '{}', 'sold');
insert into public.ai_tryon_logs (id, user_id, product_id, user_image_url, status, credits_charged) values
  ('20000000-0000-0000-0000-000000000001', 'user_red_refund', '10000000-0000-0000-0000-000000000001', 'fixture.png', 'failed', 1);

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'P0001', message = p_case;
  end if;
end;
$assert$;

create function pg_temp.capture_invalid(
  p_case text,
  p_statement text,
  p_profile text default null
) returns void language plpgsql as $capture$
declare
  before_credit integer := 0;
  before_logs integer;
  before_transactions integer;
  outcome text := 'missing P0001 validation error';
begin
  if p_profile is not null then
    select credits into before_credit from public.profiles where id = p_profile;
  end if;
  select count(*) into before_logs from public.ai_tryon_logs;
  select count(*) into before_transactions from public.credit_transactions;
  begin
    execute p_statement;
  exception when sqlstate 'P0001' then
    outcome := 'P0001';
  when others then
    outcome := format('pre-hardening error %s: %s', sqlstate, sqlerrm);
  end;
  insert into behavior_evidence
  select
    p_case,
    outcome,
    case when p_profile is null then 0 else credits - before_credit end,
    (select count(*) from public.ai_tryon_logs) - before_logs,
    (select count(*) from public.credit_transactions) - before_transactions
  from (select 0 as credits where p_profile is null union all select credits from public.profiles where id = p_profile) profile;
end;
$capture$;

-- Every invalid probe must report P0001 and leave zero deltas.
select pg_temp.capture_invalid('malformed_identity', $$select public.use_ai_credit('malformed_identity', '10000000-0000-0000-0000-000000000001', 'fixture.png')$$, 'user_red_valid');
select pg_temp.capture_invalid('invalid_reference_or_state', $$select public.use_ai_credit('user_red_invalid_ref', '10000000-0000-0000-0000-000000000002', '')$$, 'user_red_invalid_ref');
select pg_temp.capture_invalid('missing_product_row', $$select public.use_ai_credit('user_red_valid', '10000000-0000-0000-0000-000000000099', 'fixture.png')$$, 'user_red_valid');
select pg_temp.capture_invalid('insufficient_credit', $$select public.use_ai_credit('user_red_insufficient', '10000000-0000-0000-0000-000000000001', 'fixture.png')$$, 'user_red_insufficient');
select pg_temp.capture_invalid('zero_increment', $$select public.increment_credits('user_red_zero', 0)$$, 'user_red_zero');
select pg_temp.capture_invalid('negative_increment', $$select public.increment_credits('user_red_negative', -1)$$, 'user_red_negative');
select pg_temp.capture_invalid('missing_increment_profile', $$select public.increment_credits('user_red_missing_profile', 1)$$);
select pg_temp.capture_invalid('missing_refund_log', $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000099')$$);

set local role service_role;
select public.use_ai_credit('user_red_valid', '10000000-0000-0000-0000-000000000001', 'fixture.png');
select public.refund_ai_credit('20000000-0000-0000-0000-000000000001');
select public.increment_credits('user_red_zero', 42);
reset role;
select pg_temp.capture_invalid('repeat_refund', $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000001')$$, 'user_red_refund');

select pg_temp.assert_true((select count(*) from green_evidence) = 9, 'green_catalog_incomplete');
select pg_temp.assert_true(not exists (
  select 1 from behavior_evidence
  where finding <> 'P0001' or credit_delta <> 0 or log_delta <> 0 or transaction_delta <> 0
), 'invalid_flow_changed_state');
select pg_temp.assert_true((select credits from public.profiles where id = 'user_red_valid') = 1, 'service_role_debit_failed');
select pg_temp.assert_true((select credits from public.profiles where id = 'user_red_refund') = 1, 'service_role_refund_failed');
select pg_temp.assert_true((select credits from public.profiles where id = 'user_red_zero') = 47, 'arbitrary_positive_increment_failed');
select pg_temp.assert_true((select credits_charged from public.ai_tryon_logs where id = '20000000-0000-0000-0000-000000000001') = 0, 'refund_not_claimed');

create function pg_temp.assert_denied(p_role text, p_statement text) returns void language plpgsql as $denied$
begin
  execute format('set local role %I', p_role);
  begin
    execute p_statement;
    raise exception using errcode = 'P0001', message = 'client_execute_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$denied$;

select pg_temp.assert_denied('anon', statement) from unnest(array[
  $$select public.use_ai_credit('user_red_valid', '10000000-0000-0000-0000-000000000001', 'fixture.png')$$,
  $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000001')$$,
  $$select public.increment_credits('user_red_valid', 1)$$
]) statement;
select pg_temp.assert_denied('authenticated', statement) from unnest(array[
  $$select public.use_ai_credit('user_red_valid', '10000000-0000-0000-0000-000000000001', 'fixture.png')$$,
  $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000001')$$,
  $$select public.increment_credits('user_red_valid', 1)$$
]) statement;

table green_evidence;
table behavior_evidence;
rollback;
