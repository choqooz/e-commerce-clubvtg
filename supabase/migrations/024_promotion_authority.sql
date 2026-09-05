begin;
create table public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  discount_bps integer not null check (discount_bps between 1 and 5000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check ((is_active and ended_at is null and ended_reason is null) or (not is_active and ended_at is not null and btrim(ended_reason) <> ''))
);
create table public.promotion_versions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotion_campaigns(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  discount_bps integer not null check (discount_bps between 1 and 5000),
  created_at timestamptz not null default now(),
  unique (promotion_id, version_number)
);
create table public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotion_campaigns(id) on delete restrict,
  product_type_id uuid not null references public.product_types(id) on delete restrict,
  product_subtype_id uuid,
  foreign key (product_subtype_id, product_type_id)
    references public.product_subtypes(id, product_type_id) on delete restrict
);
create table public.promotion_audit_events (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotion_campaigns(id) on delete restrict,
  actor text not null check (btrim(actor) <> ''),
  action text not null check (action in ('created', 'ended_early', 'deactivated')),
  reason text,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  check ((action = 'created' and reason is null) or (action <> 'created' and btrim(reason) <> ''))
);
create index promotion_campaigns_active_schedule_idx on public.promotion_campaigns (starts_at, ends_at) where is_active;
create index promotion_targets_type_idx on public.promotion_targets (product_type_id, product_subtype_id);
create unique index promotion_targets_unique_scope_idx
  on public.promotion_targets (promotion_id, product_type_id, coalesce(product_subtype_id, '00000000-0000-0000-0000-000000000000'::uuid));
create function public.prevent_promotion_history_mutation() returns trigger
language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = 'P0001', message = case tg_table_name
    when 'promotion_versions' then 'promotion_version_immutable'
    when 'promotion_targets' then 'promotion_target_immutable'
    else 'promotion_audit_immutable' end;
end;
$function$;
create function public.guard_promotion_campaign_update() returns trigger
language plpgsql set search_path = '' as $function$
begin
  if new.discount_bps <> old.discount_bps or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then
    raise exception using errcode = 'P0001', message = 'promotion_terms_immutable';
  end if;
  if not old.is_active and new.is_active then raise exception using errcode = 'P0001', message = 'promotion_reactivation_forbidden'; end if;
  if old.is_active and not new.is_active and (new.ended_at is null or btrim(coalesce(new.ended_reason, '')) = '') then
    raise exception using errcode = 'P0001', message = 'promotion_end_reason_required';
  end if;
  return new;
end;
$function$;
create function public.guard_promotion_target_overlap() returns trigger
language plpgsql set search_path = '' as $function$
declare v_campaign public.promotion_campaigns%rowtype;
begin
  select * into v_campaign from public.promotion_campaigns where id = new.promotion_id for key share;
  if not found or not v_campaign.is_active then raise exception using errcode = 'P0001', message = 'promotion_not_active'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-type:' || new.product_type_id::text, 0));
  if exists (
    select 1 from public.promotion_targets targets
    join public.promotion_campaigns campaigns on campaigns.id = targets.promotion_id
    where campaigns.id <> new.promotion_id and campaigns.is_active
      and campaigns.starts_at < v_campaign.ends_at and campaigns.ends_at > v_campaign.starts_at
      and targets.product_type_id = new.product_type_id
      and (targets.product_subtype_id is null or new.product_subtype_id is null or targets.product_subtype_id = new.product_subtype_id)
  ) then raise exception using errcode = 'P0001', message = 'promotion_target_overlap'; end if;
  return new;
end;
$function$;
create trigger promotion_campaign_terms_guard before update on public.promotion_campaigns for each row execute function public.guard_promotion_campaign_update();
create trigger promotion_versions_immutable before update or delete on public.promotion_versions
for each row execute function public.prevent_promotion_history_mutation();
create trigger promotion_targets_immutable before update or delete on public.promotion_targets
for each row execute function public.prevent_promotion_history_mutation();
create trigger promotion_audits_immutable before update or delete on public.promotion_audit_events
for each row execute function public.prevent_promotion_history_mutation();
create trigger promotion_target_overlap_guard before insert on public.promotion_targets for each row execute function public.guard_promotion_target_overlap();
create function public.create_promotion(
  p_actor text, p_discount_bps integer, p_starts_at timestamptz, p_ends_at timestamptz, p_targets jsonb
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_promotion_id uuid; v_target record;
begin
  if p_discount_bps not between 1 and 5000 then raise exception using errcode = '23514', message = 'promotion_discount_bps_out_of_range'; end if;
  if p_starts_at >= p_ends_at then raise exception using errcode = '23514', message = 'promotion_schedule_invalid'; end if;
  if btrim(coalesce(p_actor, '')) = '' or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception using errcode = '22023', message = 'promotion_input_invalid';
  end if;
  for v_target in
    select product_type_id, product_subtype_id from jsonb_to_recordset(p_targets) as target(product_type_id uuid, product_subtype_id uuid)
    order by product_type_id, product_subtype_id nulls first
  loop
    if v_target.product_type_id is null then raise exception using errcode = '22023', message = 'promotion_target_type_required'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-type:' || v_target.product_type_id::text, 0));
  end loop;
  insert into public.promotion_campaigns (discount_bps, starts_at, ends_at) values (p_discount_bps, p_starts_at, p_ends_at) returning id into v_promotion_id;
  insert into public.promotion_versions (promotion_id, version_number, discount_bps) values (v_promotion_id, 1, p_discount_bps);
  insert into public.promotion_targets (promotion_id, product_type_id, product_subtype_id)
  select v_promotion_id, target.product_type_id, target.product_subtype_id
  from jsonb_to_recordset(p_targets) as target(product_type_id uuid, product_subtype_id uuid)
  order by target.product_type_id, target.product_subtype_id nulls first;
  insert into public.promotion_audit_events (promotion_id, actor, action, before_state, after_state)
  values (v_promotion_id, p_actor, 'created', '{}'::jsonb, jsonb_build_object('discount_bps', p_discount_bps, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return v_promotion_id;
end;
$function$;
create function public.end_promotion_early(p_actor text, p_promotion_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_before jsonb; v_after jsonb;
begin
  if btrim(coalesce(p_actor, '')) = '' or btrim(coalesce(p_reason, '')) = '' then raise exception using errcode = '22023', message = 'promotion_end_reason_required'; end if;
  select to_jsonb(campaigns) into v_before from public.promotion_campaigns campaigns where id = p_promotion_id for update;
  if v_before is null then raise exception using errcode = 'P0001', message = 'promotion_not_found'; end if;
  update public.promotion_campaigns set is_active = false, ended_at = pg_catalog.statement_timestamp(), ended_reason = btrim(p_reason) where id = p_promotion_id and is_active;
  if not found then raise exception using errcode = 'P0001', message = 'promotion_not_active'; end if;
  select to_jsonb(campaigns) into v_after from public.promotion_campaigns campaigns where id = p_promotion_id;
  insert into public.promotion_audit_events (promotion_id, actor, action, reason, before_state, after_state)
  values (p_promotion_id, p_actor, 'ended_early', btrim(p_reason), v_before, v_after);
end;
$function$;

create schema private; revoke all on schema private from public;
create function private.catalog_product_prices() returns table (id uuid, title text, slug text, description text, price numeric, size text, color text, category text, image_urls text[], status public.product_status, reserved_at timestamptz, created_at timestamptz, updated_at timestamptz, subcategory text, brand text, condition text, measurements text, product_type_id uuid, product_subtype_id uuid, base_price numeric, current_price numeric, promotion_percent integer, promotion_ends_at timestamptz)
language sql stable security definer set search_path = '' as $function$
  select products.id, products.title, products.slug, products.description, products.price, products.size, products.color, products.category, products.image_urls, products.status, products.reserved_at, products.created_at, products.updated_at, products.subcategory, products.brand, products.condition, products.measurements, products.product_type_id, products.product_subtype_id, products.price, coalesce(round(products.price * (10000 - promotions.discount_bps) / 10000, 2), products.price), promotions.discount_bps / 100, promotions.ends_at
  from public.products products left join lateral (select campaigns.discount_bps, campaigns.ends_at from public.promotion_campaigns campaigns join public.promotion_targets targets on targets.promotion_id = campaigns.id where campaigns.is_active and campaigns.starts_at <= pg_catalog.statement_timestamp() and campaigns.ends_at > pg_catalog.statement_timestamp() and targets.product_type_id = products.product_type_id and (targets.product_subtype_id is null or targets.product_subtype_id = products.product_subtype_id) order by campaigns.ends_at asc limit 1) promotions on true
  where products.status = 'available'::public.product_status;
$function$;
revoke all on function private.catalog_product_prices() from public; grant usage on schema private to anon, authenticated;
grant execute on function private.catalog_product_prices() to anon, authenticated;
create view public.catalog_product_prices with (security_invoker = true) as select * from private.catalog_product_prices();

alter table public.promotion_campaigns enable row level security;
alter table public.promotion_versions enable row level security;
alter table public.promotion_targets enable row level security;
alter table public.promotion_audit_events enable row level security;
revoke all on public.promotion_campaigns, public.promotion_versions, public.promotion_targets, public.promotion_audit_events from public, anon, authenticated;
revoke execute on function public.create_promotion(text, integer, timestamptz, timestamptz, jsonb), public.end_promotion_early(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_promotion(text, integer, timestamptz, timestamptz, jsonb), public.end_promotion_early(text, uuid, text) to service_role, postgres;
grant select on public.catalog_product_prices to anon, authenticated;

commit;
