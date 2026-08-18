-- PR 1 RED baseline: run only against a disposable database with 001--012;
-- never the production-like remote or customer data. It ROLLBACKs fixtures,
-- then intentionally exits non-zero with pre_hardening_red_evidence_complete.
-- PR 2 replaces it only after migration 013 exists.
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

create temp table red_evidence (case_name text primary key, finding text not null) on commit drop;
create temp table behavior_evidence (
  case_name text primary key,
  finding text not null,
  credit_delta integer not null default 0,
  log_delta integer not null default 0,
  transaction_delta integer not null default 0
) on commit drop;

-- PRE-HARDENING RED CATALOG ASSERTIONS. These must be present before 013.
with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into red_evidence
select 'exact_signatures_present', format('found %s target signatures', count(*))
from targets having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into red_evidence
select 'missing_function_local_search_path', string_agg(function_oid::text, ', ')
from targets join pg_proc functions on functions.oid = targets.function_oid
where not exists (
  select 1 from unnest(coalesce(functions.proconfig, '{}'::text[])) setting_name
  where setting_name = 'search_path='
)
having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into red_evidence
select 'public_anon_authenticated_execute', string_agg(function_oid::text, ', ')
from targets
where has_function_privilege('anon', function_oid, 'EXECUTE')
  and has_function_privilege('authenticated', function_oid, 'EXECUTE')
having count(*) = 3;

with targets(function_oid) as (
  values
    ('public.use_ai_credit(text,uuid,text)'::regprocedure),
    ('public.refund_ai_credit(uuid)'::regprocedure),
    ('public.increment_credits(text,integer)'::regprocedure)
)
insert into red_evidence
select 'public_acl_inheritance_path', string_agg(function_oid::text, ', ')
from targets join pg_proc functions on functions.oid = targets.function_oid
cross join lateral aclexplode(coalesce(functions.proacl, acldefault('f', functions.proowner))) acl
where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
having count(*) = 3;

insert into red_evidence
select 'unsafe_postgres_public_defaults', 'postgres public function defaults grant EXECUTE to PUBLIC/client roles'
where exists (
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

insert into red_evidence
select 'trigger_helper_scope_unchanged', 'public.update_orders_updated_at() remains attached to its order trigger'
where to_regprocedure('public.update_orders_updated_at()') is not null
  and exists (
    select 1 from pg_trigger trigger_definition
    where trigger_definition.tgfoid = 'public.update_orders_updated_at()'::regprocedure
      and not trigger_definition.tgisinternal
  );

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

create function pg_temp.capture_red(
  p_case text,
  p_statement text,
  p_profile text default null
) returns void language plpgsql as $capture$
declare
  before_credit integer := 0;
  before_logs integer;
  before_transactions integer;
  outcome text := 'RED: call returned instead of deterministic validation error';
begin
  if p_profile is not null then
    select credits into before_credit from public.profiles where id = p_profile;
  end if;
  select count(*) into before_logs from public.ai_tryon_logs;
  select count(*) into before_transactions from public.credit_transactions;
  begin
    execute p_statement;
  exception when others then
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

-- Post-hardening contract: every invalid probe must report P0001 and zero deltas.
select pg_temp.capture_red('malformed_identity', $$select public.use_ai_credit('malformed_identity', '10000000-0000-0000-0000-000000000001', 'fixture.png')$$, 'user_red_valid');
select pg_temp.capture_red('invalid_reference_or_state', $$select public.use_ai_credit('user_red_invalid_ref', '10000000-0000-0000-0000-000000000002', '')$$, 'user_red_invalid_ref');
select pg_temp.capture_red('missing_product_row', $$select public.use_ai_credit('user_red_valid', '10000000-0000-0000-0000-000000000099', 'fixture.png')$$, 'user_red_valid');
select pg_temp.capture_red('insufficient_credit', $$select public.use_ai_credit('user_red_insufficient', '10000000-0000-0000-0000-000000000001', 'fixture.png')$$, 'user_red_insufficient');
select pg_temp.capture_red('zero_increment', $$select public.increment_credits('user_red_zero', 0)$$, 'user_red_zero');
select pg_temp.capture_red('negative_increment', $$select public.increment_credits('user_red_negative', -1)$$, 'user_red_negative');
select pg_temp.capture_red('missing_increment_profile', $$select public.increment_credits('user_red_missing_profile', 1)$$);
select pg_temp.capture_red('missing_refund_log', $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000099')$$);
select pg_temp.capture_red('first_refund', $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000001')$$, 'user_red_refund');
select pg_temp.capture_red('repeat_refund', $$select public.refund_ai_credit('20000000-0000-0000-0000-000000000001')$$, 'user_red_refund');

table red_evidence;
table behavior_evidence;
rollback;

do $red_sentinel$
begin
  raise exception using
    errcode = 'P0001',
    message = 'pre_hardening_red_evidence_complete',
    hint = 'Expected until migration 013 and green verification replace this baseline.';
end;
$red_sentinel$;
