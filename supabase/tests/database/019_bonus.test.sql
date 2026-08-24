-- Run only against a fresh disposable database after migrations 001–018.
-- The caller seeds user_019_legacy before installing migration 019, then runs this file.
-- PGOPTIONS='-c app.disposable_test=true -c app.disposable_dblink_connection=postgresql://...' \
--   psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/database/019_bonus.test.sql

do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true'
    or coalesce(current_setting('app.disposable_dblink_connection', true), '') = '' then
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

-- RED catalog assertion: this is absent before migration 019 is installed.
select pg_temp.assert_true(
  to_regprocedure('public.apply_clerk_registration_bonus(text,timestamp with time zone)') is not null,
  'registration_bonus_rpc_missing'
);

select pg_temp.assert_true(
  (select credits = 9 and registration_bonus_granted_at is null
   from public.profiles where id = 'user_019_legacy'),
  'legacy_profile_was_backfilled'
);

select pg_temp.assert_true(
  (select registration_bonus_activated_at is null
   from public.clerk_lifecycle_config where singleton),
  'migration_must_install_bonus_authority_inactive'
);

select pg_temp.assert_true(
  (select prosecdef
      and proconfig @> array['search_path=""']
      and pg_get_userbyid(proowner) = 'postgres'
   from pg_proc
   where oid = 'public.apply_clerk_registration_bonus(text,timestamp with time zone)'::regprocedure),
  'registration_bonus_rpc_security_contract_invalid'
);

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.apply_clerk_registration_bonus(text,timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'public.apply_clerk_registration_bonus(text,timestamp with time zone)', 'execute')
  and has_function_privilege('service_role', 'public.apply_clerk_registration_bonus(text,timestamp with time zone)', 'execute')
  and has_function_privilege('postgres', 'public.apply_clerk_registration_bonus(text,timestamp with time zone)', 'execute'),
  'registration_bonus_rpc_acl_invalid'
);

create function pg_temp.assert_denied(p_role text, p_statement text) returns void
language plpgsql as $denied$
begin
  execute format('set local role %I', p_role);
  begin
    execute p_statement;
    raise exception 'client_execute_unexpectedly_allowed';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end;
$denied$;

select pg_temp.assert_denied('anon', $$select public.apply_clerk_registration_bonus('user_019_legacy', pg_catalog.now())$$);
select pg_temp.assert_denied('authenticated', $$select public.apply_clerk_registration_bonus('user_019_legacy', pg_catalog.now())$$);
select pg_temp.assert_denied('service_role', $$update public.clerk_lifecycle_config set registration_bonus_activated_at = pg_catalog.now() where singleton$$);

create extension if not exists dblink;

begin;
insert into public.profiles (id, email, credits) values
  ('user_019_inactive', 'inactive@example.invalid', 3),
  ('user_019_duplicate', 'duplicate@example.invalid', 7),
  ('user_019_concurrent', 'concurrent@example.invalid', 0),
  ('user_019_rollback', 'rollback@example.invalid', 5);

set local role service_role;
select pg_temp.assert_true(
  public.apply_clerk_registration_bonus('user_019_inactive', pg_catalog.now()) = 'inactive',
  'inactive_authority_granted_bonus'
);
reset role;

select pg_temp.assert_true(
  (select credits = 3 and registration_bonus_granted_at is null
   from public.profiles where id = 'user_019_inactive')
  and not exists (select 1 from public.credit_transactions where user_id = 'user_019_inactive'),
  'inactive_authority_mutated_state'
);

update public.clerk_lifecycle_config
set registration_bonus_activated_at = pg_catalog.now() - pg_catalog.make_interval(secs => 1)
where singleton;
commit;

begin;
set local role service_role;
select pg_temp.assert_true(
  public.apply_clerk_registration_bonus('user_019_duplicate', pg_catalog.now()) = 'granted',
  'first_registration_bonus_not_granted'
);
select pg_temp.assert_true(
  public.apply_clerk_registration_bonus('user_019_duplicate', pg_catalog.now()) = 'already_granted',
  'duplicate_registration_bonus_not_noop'
);
reset role;

select pg_temp.assert_true(
  (select credits = 9 and registration_bonus_granted_at is not null
   from public.profiles where id = 'user_019_duplicate')
  and (select count(*) = 1 from public.credit_transactions
       where user_id = 'user_019_duplicate' and amount = 2 and reason = 'registration_bonus'),
  'duplicate_registration_bonus_changed_state'
);
commit;

-- dblink is installed only in this disposable PostgreSQL instance. Two independent
-- connections start before either result is collected, proving real lock contention.
select dblink_connect('bonus_a', current_setting('app.disposable_dblink_connection'));
select dblink_connect('bonus_b', current_setting('app.disposable_dblink_connection'));
select dblink_send_query('bonus_a', $$select public.apply_clerk_registration_bonus('user_019_concurrent', pg_catalog.now())$$);
select dblink_send_query('bonus_b', $$select public.apply_clerk_registration_bonus('user_019_concurrent', pg_catalog.now())$$);
create temp table concurrent_results (result text not null);
insert into concurrent_results select result from dblink_get_result('bonus_a') as result(result text);
insert into concurrent_results select result from dblink_get_result('bonus_b') as result(result text);
select dblink_disconnect('bonus_a');
select dblink_disconnect('bonus_b');

select pg_temp.assert_true(
  (select count(*) = 1 from concurrent_results where result = 'granted')
  and (select count(*) = 1 from concurrent_results where result = 'already_granted')
  and (select credits = 2 and registration_bonus_granted_at is not null
       from public.profiles where id = 'user_019_concurrent')
  and (select count(*) = 1 from public.credit_transactions
       where user_id = 'user_019_concurrent' and amount = 2 and reason = 'registration_bonus'),
  'concurrent_registration_bonus_not_exactly_once'
);

begin;
create function pg_temp.reject_bonus_ledger() returns trigger language plpgsql as $trigger$
begin
  if new.user_id = 'user_019_rollback' then
    raise exception 'forced_bonus_ledger_failure';
  end if;
  return new;
end;
$trigger$;
create trigger reject_bonus_ledger
before insert on public.credit_transactions
for each row execute function pg_temp.reject_bonus_ledger();

do $validation$
begin
  begin
    perform public.apply_clerk_registration_bonus('invalid user id', pg_catalog.now());
    raise exception 'invalid_user_id_accepted';
  exception when sqlstate 'P0001' then
    null;
  end;

  begin
    perform public.apply_clerk_registration_bonus('user_019_rollback', pg_catalog.now());
    raise exception 'forced_bonus_ledger_failure_not_raised';
  exception when raise_exception then
    if sqlerrm = 'forced_bonus_ledger_failure_not_raised' then
      raise;
    end if;
  end;
end;
$validation$;

drop trigger reject_bonus_ledger on public.credit_transactions;
select pg_temp.assert_true(
  (select credits = 5 and registration_bonus_granted_at is null
   from public.profiles where id = 'user_019_rollback')
  and not exists (select 1 from public.credit_transactions where user_id = 'user_019_rollback'),
  'bonus_failure_did_not_rollback'
);
rollback;

select '019_bonus_proof_passed' as result,
  (select credits from public.profiles where id = 'user_019_concurrent') as concurrent_credits,
  (select count(*) from public.credit_transactions
   where user_id = 'user_019_concurrent' and amount = 2 and reason = 'registration_bonus') as concurrent_ledger_rows;
