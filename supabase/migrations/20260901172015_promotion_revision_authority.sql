begin;
alter table public.promotion_audit_events drop constraint promotion_audit_events_action_check;
alter table public.promotion_audit_events add constraint promotion_audit_events_action_check
  check (action in ('created', 'ended_early', 'deactivated', 'revised'));
create table public.promotion_terms_update_authorizations (
  promotion_id uuid primary key references public.promotion_campaigns(id) on delete cascade,
  expected_discount_bps integer not null,
  next_discount_bps integer not null,
  expected_starts_at timestamptz not null,
  next_starts_at timestamptz not null,
  expected_ends_at timestamptz not null,
  next_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.promotion_terms_update_authorizations enable row level security;
revoke all on public.promotion_terms_update_authorizations from public, anon, authenticated, service_role;
create or replace function public.guard_promotion_campaign_update() returns trigger
language plpgsql set search_path = '' as $function$
begin
  if new.discount_bps <> old.discount_bps or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then
    delete from public.promotion_terms_update_authorizations
    where promotion_id = old.id
      and expected_discount_bps = old.discount_bps
      and next_discount_bps = new.discount_bps
      and expected_starts_at = old.starts_at
      and next_starts_at = new.starts_at
      and expected_ends_at = old.ends_at
      and next_ends_at = new.ends_at;
    if not found then
      raise exception using errcode = 'P0001', message = 'promotion_terms_immutable';
    end if;
    if old.starts_at <= pg_catalog.statement_timestamp() or new.starts_at <= pg_catalog.statement_timestamp() then
      raise exception using errcode = 'P0001', message = 'promotion_revision_not_future';
    end if;
  end if;
  if not old.is_active and new.is_active then
    raise exception using errcode = 'P0001', message = 'promotion_reactivation_forbidden';
  end if;
  if old.is_active and not new.is_active and (new.ended_at is null or btrim(coalesce(new.ended_reason, '')) = '') then
    raise exception using errcode = 'P0001', message = 'promotion_end_reason_required';
  end if;
  return new;
end;
$function$;
create function public.revise_promotion(
  p_actor text, p_promotion_id uuid, p_discount_bps integer, p_starts_at timestamptz,
  p_ends_at timestamptz, p_targets jsonb, p_reason text
) returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_campaign public.promotion_campaigns%rowtype; v_before jsonb; v_after jsonb;
  v_current_targets jsonb; v_proposed_targets jsonb; v_next_version integer; v_target record;
begin
  if p_discount_bps not between 1 and 5000 then
    raise exception using errcode = '23514', message = 'promotion_discount_bps_out_of_range';
  end if;
  if p_starts_at >= p_ends_at then
    raise exception using errcode = '23514', message = 'promotion_schedule_invalid';
  end if;
  if p_starts_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'promotion_revision_not_future';
  end if;
  if btrim(coalesce(p_actor, '')) = '' or btrim(coalesce(p_reason, '')) = ''
    or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception using errcode = '22023', message = 'promotion_revision_input_invalid';
  end if;
  select * into v_campaign from public.promotion_campaigns where id = p_promotion_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'promotion_not_found'; end if;
  if not v_campaign.is_active then raise exception using errcode = 'P0001', message = 'promotion_not_active'; end if;
  if v_campaign.starts_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'promotion_revision_not_future';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_type_id', targets.product_type_id, 'product_subtype_id', targets.product_subtype_id) order by targets.product_type_id, targets.product_subtype_id nulls first), '[]'::jsonb) into v_current_targets
  from public.promotion_targets targets where targets.promotion_id = p_promotion_id;
  select coalesce(jsonb_agg(jsonb_build_object('product_type_id', targets.product_type_id, 'product_subtype_id', targets.product_subtype_id) order by targets.product_type_id, targets.product_subtype_id nulls first), '[]'::jsonb) into v_proposed_targets
  from jsonb_to_recordset(p_targets) as targets(product_type_id uuid, product_subtype_id uuid);
  if v_current_targets <> v_proposed_targets then
    raise exception using errcode = 'P0001', message = 'promotion_revision_targets_immutable';
  end if;
  for v_target in select product_type_id, product_subtype_id from jsonb_to_recordset(p_targets) as target(product_type_id uuid, product_subtype_id uuid)
    order by product_type_id, product_subtype_id nulls first
  loop
    if v_target.product_type_id is null then
      raise exception using errcode = '22023', message = 'promotion_target_type_required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-type:' || v_target.product_type_id::text, 0));
  end loop;
  if exists (select 1 from public.promotion_targets targets
    join public.promotion_campaigns campaigns on campaigns.id = targets.promotion_id
    where campaigns.id <> p_promotion_id and campaigns.is_active
      and campaigns.starts_at < p_ends_at and campaigns.ends_at > p_starts_at
      and exists (select 1 from jsonb_to_recordset(p_targets) as candidate(product_type_id uuid, product_subtype_id uuid)
        where candidate.product_type_id = targets.product_type_id
          and (candidate.product_subtype_id is null or targets.product_subtype_id is null or candidate.product_subtype_id = targets.product_subtype_id)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'promotion_target_overlap';
  end if;
  v_before := jsonb_build_object('discount_bps', v_campaign.discount_bps, 'starts_at', v_campaign.starts_at, 'ends_at', v_campaign.ends_at, 'is_active', v_campaign.is_active, 'targets', v_current_targets);
  insert into public.promotion_terms_update_authorizations (
    promotion_id, expected_discount_bps, next_discount_bps,
    expected_starts_at, next_starts_at, expected_ends_at, next_ends_at
  ) values (
    p_promotion_id, v_campaign.discount_bps, p_discount_bps,
    v_campaign.starts_at, p_starts_at, v_campaign.ends_at, p_ends_at
  );
  update public.promotion_campaigns
  set discount_bps = p_discount_bps, starts_at = p_starts_at, ends_at = p_ends_at
  where id = p_promotion_id;
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.promotion_versions where promotion_id = p_promotion_id;
  insert into public.promotion_versions (promotion_id, version_number, discount_bps)
  values (p_promotion_id, v_next_version, p_discount_bps);
  v_after := jsonb_build_object('discount_bps', p_discount_bps, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'is_active', true, 'targets', v_current_targets);
  insert into public.promotion_audit_events (promotion_id, actor, action, reason, before_state, after_state)
  values (p_promotion_id, p_actor, 'revised', btrim(p_reason), v_before, v_after);
  return v_next_version;
end;
$function$;
revoke execute on function public.revise_promotion(text, uuid, integer, timestamptz, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.revise_promotion(text, uuid, integer, timestamptz, timestamptz, jsonb, text) to service_role, postgres;
commit;
