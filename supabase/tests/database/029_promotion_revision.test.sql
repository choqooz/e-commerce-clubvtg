-- Run against a fresh disposable PostgreSQL 17 database after all migrations.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'P0001', message = p_case;
  end if;
end;
$assert$;
insert into public.product_types (name) values ('Revision outerwear'), ('Revision accessories');
select id as outerwear_type_id from public.product_types where name = 'Revision outerwear' \gset
select id as accessories_type_id from public.product_types where name = 'Revision accessories' \gset
set role service_role;
select public.create_promotion('user_admin', 1000, statement_timestamp() + interval '2 hours', statement_timestamp() + interval '4 hours', jsonb_build_array(jsonb_build_object('product_type_id', :'outerwear_type_id'::uuid, 'product_subtype_id', null))) as revision_promotion_id \gset
reset role;
do $forged_authorization$
begin
  begin
    set local role service_role;
    insert into public.promotion_terms_update_authorizations (
      promotion_id, expected_discount_bps, next_discount_bps,
      expected_starts_at, next_starts_at, expected_ends_at, next_ends_at
    )
    select id, discount_bps, 2000, starts_at, statement_timestamp() + interval '3 hours', ends_at, statement_timestamp() + interval '5 hours'
    from public.promotion_campaigns
    where starts_at > statement_timestamp() + interval '1 hour'
      and starts_at < statement_timestamp() + interval '3 hours';
    raise exception 'direct_revision_authorization_insert_accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role service_role;
    perform pg_catalog.set_config('app.promotion_revision', 'true', true);
    update public.promotion_campaigns
    set discount_bps = 2000, starts_at = statement_timestamp() + interval '3 hours', ends_at = statement_timestamp() + interval '5 hours'
    where starts_at > statement_timestamp() + interval '1 hour'
      and starts_at < statement_timestamp() + interval '3 hours';
    raise exception 'forged_revision_authorization_accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform pg_catalog.set_config('app.promotion_revision', 'true', true);
    update public.promotion_campaigns
    set discount_bps = 2000, starts_at = statement_timestamp() + interval '3 hours', ends_at = statement_timestamp() + interval '5 hours'
    where starts_at > statement_timestamp() + interval '1 hour'
      and starts_at < statement_timestamp() + interval '3 hours';
    raise exception 'forged_revision_authorization_accepted';
  exception when others then
    if sqlerrm <> 'promotion_terms_immutable' then raise; end if;
  end;
end;
$forged_authorization$;
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.promotion_terms_update_authorizations', 'insert')
  and not has_table_privilege('service_role', 'public.promotion_terms_update_authorizations', 'delete'),
  'service_role_must_not_forge_promotion_revision_authorization'
);
set role service_role;
select public.revise_promotion('user_admin', :'revision_promotion_id'::uuid, 2000, statement_timestamp() + interval '3 hours', statement_timestamp() + interval '5 hours', jsonb_build_array(jsonb_build_object('product_type_id', :'outerwear_type_id'::uuid, 'product_subtype_id', null)), 'Correct future campaign terms') as revision_number \gset
reset role;
select pg_temp.assert_true(:'revision_number'::integer = 2 and (select discount_bps = 2000 and version_number = 2 from public.promotion_versions where promotion_id = :'revision_promotion_id'::uuid order by version_number desc limit 1) and (select action = 'revised' and reason = 'Correct future campaign terms' and before_state ? 'targets' and after_state ? 'targets' from public.promotion_audit_events where promotion_id = :'revision_promotion_id'::uuid order by created_at desc limit 1), 'future_revision_must_append_version_two_and_audit_terms_and_targets');
set role service_role;
select public.create_promotion('user_admin', 1000, statement_timestamp() + interval '5 hours', statement_timestamp() + interval '7 hours', jsonb_build_array(jsonb_build_object('product_type_id', :'outerwear_type_id'::uuid, 'product_subtype_id', null))) as conflict_promotion_id \gset
reset role;
do $invalid_boundaries$
begin
  begin
    perform public.revise_promotion(
      'user_admin', (select id from public.promotion_campaigns where starts_at > statement_timestamp() + interval '2 hours' and starts_at < statement_timestamp() + interval '4 hours'), 3000,
      statement_timestamp() + interval '4 hours', statement_timestamp() + interval '6 hours',
      jsonb_build_array(jsonb_build_object('product_type_id', (select id from public.product_types where name = 'Revision outerwear'), 'product_subtype_id', null)),
      'Conflicting future campaign terms'
    );
    raise exception 'revision_overlap_allowed';
  exception when others then if sqlerrm <> 'promotion_target_overlap' then raise; end if; end;
  begin
    perform public.revise_promotion(
      'user_admin', (select id from public.promotion_campaigns where starts_at > statement_timestamp() + interval '2 hours' and starts_at < statement_timestamp() + interval '4 hours'), 3000,
      statement_timestamp() + interval '4 hours', statement_timestamp() + interval '6 hours',
      jsonb_build_array(jsonb_build_object('product_type_id', (select id from public.product_types where name = 'Revision accessories'), 'product_subtype_id', null)),
      'Changed target'
    );
    raise exception 'revision_target_change_allowed';
  exception when others then if sqlerrm <> 'promotion_revision_targets_immutable' then raise; end if; end;
  begin
    perform public.revise_promotion(
      'user_admin', (select id from public.promotion_campaigns where starts_at > statement_timestamp() + interval '2 hours' and starts_at < statement_timestamp() + interval '4 hours'), 3000,
      statement_timestamp(), statement_timestamp() + interval '6 hours',
      jsonb_build_array(jsonb_build_object('product_type_id', (select id from public.product_types where name = 'Revision outerwear'), 'product_subtype_id', null)),
      'Past revision start'
    );
    raise exception 'past_revision_start_allowed';
  exception when others then if sqlerrm <> 'promotion_revision_not_future' then raise; end if; end;
  begin
    set local role authenticated;
    perform public.revise_promotion('user_admin', (select id from public.promotion_campaigns where starts_at > statement_timestamp() + interval '2 hours' and starts_at < statement_timestamp() + interval '4 hours'), 1000, statement_timestamp() + interval '3 hours', statement_timestamp() + interval '5 hours', '[]', 'Unauthorized');
    raise exception 'public_revision_rpc_allowed';
  exception when insufficient_privilege then null; end;
end;
$invalid_boundaries$;
select pg_temp.assert_true(
  (select count(*) = 2 from public.promotion_versions where promotion_id = :'revision_promotion_id'::uuid)
  and (select count(*) = 1 from public.promotion_audit_events where promotion_id = :'revision_promotion_id'::uuid and action = 'revised'),
  'invalid_revisions_must_not_append_history'
);
set role service_role;
select public.create_promotion('user_admin', 1000, statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour', jsonb_build_array(jsonb_build_object('product_type_id', :'accessories_type_id'::uuid, 'product_subtype_id', null))) as started_promotion_id \gset
reset role;
do $stale_and_termination$
begin
  begin
    perform public.revise_promotion(
      'user_admin', (select id from public.promotion_campaigns where starts_at <= statement_timestamp()), 2000,
      statement_timestamp() + interval '1 hour', statement_timestamp() + interval '2 hours',
      jsonb_build_array(jsonb_build_object('product_type_id', (select id from public.product_types where name = 'Revision accessories'), 'product_subtype_id', null)),
      'Too late to revise'
    );
    raise exception 'started_promotion_revised';
  exception when others then if sqlerrm <> 'promotion_revision_not_future' then raise; end if; end;
end;
$stale_and_termination$;
set role service_role;
select public.end_promotion_early('user_admin', :'started_promotion_id'::uuid, 'Separate early termination');
reset role;
select pg_temp.assert_true(
  (select count(*) = 1 from public.promotion_versions where promotion_id = :'started_promotion_id'::uuid)
  and (select count(*) = 0 from public.promotion_audit_events where promotion_id = :'started_promotion_id'::uuid and action = 'revised')
  and (select count(*) = 1 from public.promotion_audit_events where promotion_id = :'started_promotion_id'::uuid and action = 'ended_early'),
  'early_termination_must_not_be_relabelled_as_revision'
);
select '029_promotion_revision_proof_passed' as result;
