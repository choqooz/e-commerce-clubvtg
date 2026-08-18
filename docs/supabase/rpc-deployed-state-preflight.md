# Privileged RPC Deployed-State Preflight
## Purpose and boundary

Use this immediately before `013_harden_supabase_rpcs.sql`; it captures catalog metadata only: no customer rows, fixtures, writes, or secrets.
Use an approved read-only role and an ephemeral connection supplied outside this document; never store a URL, token, project secret, customer identifier, or customer output.
Scope: `public.use_ai_credit(text,uuid,text)`, `public.refund_ai_credit(uuid)`, and `public.increment_credits(text,integer)`; inspect but never alter `public.update_orders_updated_at()`.

## 1. Establish the target identity

Before collecting evidence, confirm the connection is the approved rollout target. Obtain its project reference and database name from the deployment record, not a copied local environment file.

```sql
select
  current_database() as database_name,
  current_user as connected_role,
  current_setting('server_version') as server_version,
  inet_server_addr()::text as server_address,
  inet_server_port() as server_port;
```

Stop if the database, endpoint, role, or required catalog access differs from the approved target record.

## 2. Capture exact function identities, owners, and bodies

Store this read-only output in approved deployment evidence; its exact body is the source for an additive rollback.

```sql
with targets as (
  select unnest(array[
    'public.use_ai_credit(text,uuid,text)'::regprocedure,
    'public.refund_ai_credit(uuid)'::regprocedure,
    'public.increment_credits(text,integer)'::regprocedure
  ]) as function_oid
)
select
  targets.function_oid::regprocedure as exact_signature,
  n.nspname as schema_name,
  r.rolname as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_functiondef(p.oid) as function_definition
from targets
join pg_proc p on p.oid = targets.function_oid
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on r.oid = p.proowner
order by exact_signature::text;
```

Confirm exact signatures, a function-local `search_path`, qualified dependencies, and expected definer behavior; any difference is drift.

## 3. Inspect effective and inherited execution privileges

`PUBLIC` is an implicit inheritance path: a function can be executable by `anon` or `authenticated` even when those names are absent from its ACL. Capture raw ACL entries and effective privileges:

```sql
with targets as (
  select unnest(array[
    'public.use_ai_credit(text,uuid,text)'::regprocedure,
    'public.refund_ai_credit(uuid)'::regprocedure,
    'public.increment_credits(text,integer)'::regprocedure
  ]) as function_oid
), acl_entries as (
  select
    p.oid,
    coalesce(p.proacl, acldefault('f', p.proowner)) as acl
  from targets
  join pg_proc p on p.oid = targets.function_oid
)
select
  entries.oid::regprocedure as exact_signature,
  case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end as grantee,
  case when acl.grantor = 0 then 'PUBLIC' else grantor_role.rolname end as grantor,
  acl.privilege_type,
  acl.is_grantable,
  has_function_privilege('anon', entries.oid, 'EXECUTE') as anon_effective_execute,
  has_function_privilege('authenticated', entries.oid, 'EXECUTE') as authenticated_effective_execute,
  has_function_privilege('service_role', entries.oid, 'EXECUTE') as service_role_effective_execute,
  has_function_privilege('postgres', entries.oid, 'EXECUTE') as postgres_effective_execute
from acl_entries entries
cross join lateral aclexplode(entries.acl) as acl
left join pg_roles grantee_role on grantee_role.oid = acl.grantee
left join pg_roles grantor_role on grantor_role.oid = acl.grantor
order by exact_signature::text, grantee, acl.privilege_type;
```

The target denies `PUBLIC`, `anon`, and `authenticated`, and grants only the intended server role plus owner; unexpected roles or grants block rollout.

## 4. Inspect owner-specific future function defaults

Defaults are owner-specific. Do not infer `supabase_admin` defaults from `postgres`; capture `postgres` function defaults for `public` and global scope:

```sql
select
  owner_role.rolname as creating_owner,
  coalesce(namespace_name.nspname, '<global>') as schema_scope,
  default_acl.defaclacl as default_function_acl,
  case
    when default_acl.defaclacl is null then null
    else array_agg(
      format(
        '%s:%s',
        case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end,
        acl.privilege_type
      )
      order by case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end,
      acl.privilege_type
    ) filter (where acl.privilege_type is not null)
  end as expanded_entries
from pg_default_acl default_acl
join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
left join pg_namespace namespace_name on namespace_name.oid = default_acl.defaclnamespace
left join lateral aclexplode(default_acl.defaclacl) acl on true
left join pg_roles grantee_role on grantee_role.oid = acl.grantee
where default_acl.defaclobjtype = 'f'
  and owner_role.rolname = 'postgres'
  and (namespace_name.nspname = 'public' or namespace_name.nspname is null)
group by owner_role.rolname, namespace_name.nspname, default_acl.defaclacl
order by schema_scope;
```

Absence of a row is not safe evidence: PostgreSQL globally grants function `EXECUTE` to `PUBLIC`. Account for that and every `postgres`/`public` default.

## 5. Record RLS and policy metadata

RLS is defense in depth, not the definer authorization boundary. Record state and policies for affected tables:

```sql
with scoped_tables(table_name) as (
  values
    ('profiles'),
    ('products'),
    ('ai_tryon_logs'),
    ('credit_transactions'),
    ('orders'),
    ('order_items')
)
select
  tables.table_name,
  classes.relrowsecurity as rls_enabled,
  classes.relforcerowsecurity as rls_forced,
  policies.policyname,
  policies.cmd as policy_command,
  policies.roles as policy_roles,
  policies.qual as using_expression,
  policies.with_check as check_expression
from scoped_tables tables
left join (pg_class classes join pg_namespace namespaces
  on namespaces.oid = classes.relnamespace and namespaces.nspname = 'public'
) on classes.relname = tables.table_name
left join pg_policies policies
  on policies.schemaname = 'public'
  and policies.tablename = tables.table_name
order by tables.table_name, policies.policyname nulls first;
```

Stop if a table is absent or RLS/policy metadata differs; do not change policies.

## 6. Check migration-history and repository drift

The deployed environment may have no native Supabase migration-history table; check that explicitly rather than claiming repository files were applied:

```sql
select
  to_regclass('supabase_migrations.schema_migrations') as native_history_relation,
  to_regclass('supabase_migrations.migrations') as alternate_history_relation;
```

If a relation exists, capture its migration names. If neither exists, record `native history absent`; never infer that repository `001`–`012` ran remotely.

Compare definitions, owners, ACLs, defaults, RLS, and helper dependency with the approved baseline. Unassessed drift means no remote write or history repair.

## 7. Record advisor findings

From the approved operational context, check `supabase db advisors --help`, then run the confirmed Security Advisor command or Dashboard equivalent. Record only finding ID, severity, object identity, and remediation status.

Mutable search-path and public-execution findings are expected RED evidence; unassessed critical findings block rollout.

## 8. Disposable PR 1 RED harness evidence

- Ran once in disposable `postgres:16` (digest `e17e…dd3d5`) with migrations `001`, `004`, `005`, and `011` only.
- Disposable-only support created roles `anon`, `authenticated`, and `service_role`; stubbed `auth.uid()`; and set `postgres`/`public` defaults. It was never persisted.
- Intentionally skipped irrelevant `002`, `006`, `007`, `009`, `010`, and `012`; `003` and `008` do not exist.
- Command shape: container `psql` with `PGOPTIONS='-c app.disposable_test=true'` running the RED SQL script.
- Expected exit was `3` after `ROLLBACK` with `P0001` `pre_hardening_red_evidence_complete`.
- Six catalog findings and ten behavior probes ran without premature errors.
- Baseline: all three RPC `proconfig` values were null; `anon`/`authenticated` execute was true; raw ACL included `PUBLIC`, `anon`, `authenticated`, `service_role`, and `postgres`.
- Rollback proof left fixture rows at `profiles=0`, `products=0`, and `ai_tryon_logs=0`.
- Containers and anonymous volumes were removed; Git was unchanged and no remote was accessed.

## 9. Safe rollout prerequisites

Proceed only with a current target and read-only snapshot; captured signatures, owners, bodies, settings, ACLs, defaults, RLS, and history; disposable RED evidence (never production fixtures); reviewed additive `013` that leaves the helper untouched; and explicit approval after preflight recheck. SDD apply does not perform the remote mutation.

## 10. Additive rollback capture

Retain sections 2–4 as rollback evidence: bodies, ACLs, owners, `proconfig`, and `postgres` defaults. Reverse a deployment only with an approved additive corrective migration; never rewrite or delete applied history.

## Stop conditions

Stop and report the discrepancy without remote writes when any of these occur:

- target identity is not verified;
- a scoped signature or trigger helper is missing or unexpected;
- the owner, function body, search path, ACL, or default privilege differs from
  the reviewed state;
- RLS/policy or migration-history evidence is unavailable or inconsistent;
- a security-advisor finding is unassessed; or
- disposable RED evidence has not been collected before the requested rollout.
