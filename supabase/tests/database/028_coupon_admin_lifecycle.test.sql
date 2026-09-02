-- Run against a fresh disposable PostgreSQL 17 database after migrations 001–028.
do $guard$ begin if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if; end $guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$ begin if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if; end $assert$;

select public.create_coupon('coupon_admin', 'LIFECYCLE28', 2, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null) as coupon_id \gset
insert into public.coupon_identity_uses (coupon_id, key_version, fingerprint) values (:'coupon_id'::uuid, 'v1', repeat('a', 64));

do $reason$
declare v_coupon_id uuid;
begin
  select id into v_coupon_id from public.coupon_definitions where code = 'LIFECYCLE28';
  begin perform public.deactivate_coupon('coupon_admin', v_coupon_id, ''); raise exception 'blank_deactivation_reason_accepted'; exception when others then if sqlerrm <> 'coupon_deactivation_reason_invalid' then raise; end if; end;
  begin perform public.deactivate_coupon('coupon_admin', v_coupon_id, repeat('x', 501)); raise exception 'unbounded_deactivation_reason_accepted'; exception when others then if sqlerrm <> 'coupon_deactivation_reason_invalid' then raise; end if; end;
end $reason$;

create temp table first_deactivation as select public.deactivate_coupon('coupon_admin', :'coupon_id'::uuid, 'campaign ended') as applied;
create temp table repeated_deactivation as select public.deactivate_coupon('coupon_admin', :'coupon_id'::uuid, 'campaign ended again') as applied;
select pg_temp.assert_true(
  (select applied from first_deactivation)
  and not (select applied from repeated_deactivation)
  and (select not is_active and deactivation_reason = 'campaign ended' from public.coupon_definitions where id = :'coupon_id'::uuid)
  and (select count(*) = 1 from public.coupon_versions where coupon_id = :'coupon_id'::uuid)
  and (select count(*) = 1 from public.coupon_identity_uses where coupon_id = :'coupon_id'::uuid)
  and (select count(*) = 1 from public.coupon_audit_events where coupon_id = :'coupon_id'::uuid and action = 'deactivated' and reason = 'campaign ended'),
  'deactivation_must_be_idempotent_and_preserve_coupon_history'
);

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.deactivate_coupon(text,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.deactivate_coupon(text,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.deactivate_coupon(text,uuid,text)', 'execute')
  and has_function_privilege('postgres', 'public.deactivate_coupon(text,uuid,text)', 'execute'),
  'deactivate_coupon_must_be_service_role_and_postgres_only'
);
select '028_coupon_admin_lifecycle_proof_passed' as result;
