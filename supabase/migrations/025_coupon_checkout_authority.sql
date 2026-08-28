begin;
create type public.coupon_discount_kind as enum ('percentage', 'fixed_ars');
create table public.coupon_definitions (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code = upper(btrim(code)) and code ~ '^[A-Z0-9-]{3,64}$'), capacity integer not null check (capacity >= 1), used_count integer not null default 0 check (used_count between 0 and capacity), starts_at timestamptz not null, ends_at timestamptz not null, is_active boolean not null default true, deactivated_at timestamptz, deactivation_reason text, created_at timestamptz not null default now(), check (starts_at < ends_at), check ((is_active and deactivated_at is null and deactivation_reason is null) or (not is_active and deactivated_at is not null and btrim(deactivation_reason) <> ''))
);
create table public.coupon_versions (
  id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupon_definitions(id) on delete restrict, version_number integer not null check (version_number > 0), discount_kind public.coupon_discount_kind not null, discount_bps integer, fixed_discount_cents bigint, created_at timestamptz not null default now(), unique (coupon_id, version_number), check ((discount_kind = 'percentage' and discount_bps between 1 and 5000 and fixed_discount_cents is null) or (discount_kind = 'fixed_ars' and discount_bps is null and fixed_discount_cents > 0))
);
create table public.coupon_identity_uses (
  coupon_id uuid not null references public.coupon_definitions(id) on delete restrict, key_version text not null check (key_version ~ '^[A-Za-z0-9._-]{1,32}$'), fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'), used_at timestamptz not null default now(), primary key (coupon_id, key_version, fingerprint)
);
create table public.coupon_audit_events (
  id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupon_definitions(id) on delete restrict, actor text not null check (btrim(actor) <> ''), action text not null check (action in ('created', 'replaced', 'replacement_created')), reason text, created_at timestamptz not null default now(), check ((action = 'created' and reason is null) or (action <> 'created' and btrim(reason) <> ''))
);
create index coupon_definitions_live_idx on public.coupon_definitions (code, starts_at, ends_at) where is_active;
create function public.prevent_coupon_history_mutation() returns trigger language plpgsql set search_path = '' as $fn$ begin raise exception using errcode = 'P0001', message = 'coupon_history_immutable'; end $fn$;
create function public.guard_coupon_definition_update() returns trigger language plpgsql set search_path = '' as $fn$ begin if new.code <> old.code or new.capacity <> old.capacity or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then raise exception using errcode = 'P0001', message = 'coupon_terms_immutable'; end if; if not old.is_active and new.is_active then raise exception using errcode = 'P0001', message = 'coupon_reactivation_forbidden'; end if; if old.is_active and (new.deactivated_at is null or btrim(coalesce(new.deactivation_reason, '')) = '') then raise exception using errcode = 'P0001', message = 'coupon_deactivation_reason_required'; end if; return new; end $fn$;
create trigger coupon_definition_guard before update on public.coupon_definitions for each row execute function public.guard_coupon_definition_update();
create trigger coupon_version_immutable before update or delete on public.coupon_versions for each row execute function public.prevent_coupon_history_mutation();
create trigger coupon_identity_immutable before update or delete on public.coupon_identity_uses for each row execute function public.prevent_coupon_history_mutation();
create trigger coupon_audit_immutable before update or delete on public.coupon_audit_events for each row execute function public.prevent_coupon_history_mutation();

create function public.create_coupon(p_actor text, p_code text, p_capacity integer, p_starts_at timestamptz, p_ends_at timestamptz, p_discount_bps integer, p_fixed_discount_cents bigint) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare v_coupon_id uuid; v_code text := upper(btrim(coalesce(p_code, ''))); v_kind public.coupon_discount_kind;
begin
  if btrim(coalesce(p_actor, '')) = '' or v_code !~ '^[A-Z0-9-]{3,64}$' or p_starts_at >= p_ends_at then raise exception using errcode = '22023', message = 'coupon_input_invalid'; end if;
  if p_discount_bps between 1 and 5000 and p_fixed_discount_cents is null then v_kind := 'percentage'; elsif p_discount_bps is null and p_fixed_discount_cents > 0 then v_kind := 'fixed_ars'; else raise exception using errcode = '22023', message = 'coupon_terms_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coupon-code:' || v_code, 0));
  insert into public.coupon_definitions (code, capacity, starts_at, ends_at) values (v_code, p_capacity, p_starts_at, p_ends_at) returning id into v_coupon_id;
  insert into public.coupon_versions (coupon_id, version_number, discount_kind, discount_bps, fixed_discount_cents) values (v_coupon_id, 1, v_kind, p_discount_bps, p_fixed_discount_cents);
  insert into public.coupon_audit_events (coupon_id, actor, action) values (v_coupon_id, p_actor, 'created'); return v_coupon_id;
end $fn$;
create function public.replace_coupon(p_actor text, p_coupon_id uuid, p_code text, p_capacity integer, p_starts_at timestamptz, p_ends_at timestamptz, p_discount_bps integer, p_fixed_discount_cents bigint, p_reason text) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare v_new_coupon_id uuid;
begin
  if btrim(coalesce(p_reason, '')) = '' then raise exception using errcode = '22023', message = 'coupon_replacement_reason_required'; end if;
  update public.coupon_definitions set is_active = false, deactivated_at = pg_catalog.statement_timestamp(), deactivation_reason = btrim(p_reason) where id = p_coupon_id and is_active;
  if not found then raise exception using errcode = 'P0001', message = 'coupon_not_active'; end if;
  insert into public.coupon_audit_events (coupon_id, actor, action, reason) values (p_coupon_id, p_actor, 'replaced', btrim(p_reason));
  v_new_coupon_id := public.create_coupon(p_actor, p_code, p_capacity, p_starts_at, p_ends_at, p_discount_bps, p_fixed_discount_cents);
  insert into public.coupon_audit_events (coupon_id, actor, action, reason) values (v_new_coupon_id, p_actor, 'replacement_created', btrim(p_reason)); return v_new_coupon_id;
end $fn$;

create function public.quote_coupon_checkout(p_product_ids uuid[], p_coupon_code text, p_identity_key_version text, p_identity_fingerprint text, p_shipping_cents bigint default 0, p_selected_source text default null) returns table (merchandise_subtotal_cents bigint, shipping_cents bigint, promotion_discount_cents bigint, coupon_discount_cents bigint, default_source text, selected_source text, winning_source text) language plpgsql security definer set search_path = '' as $fn$
declare v_coupon record; v_merchandise bigint; v_promotions bigint; v_products integer; v_coupon_discount bigint; v_code text := upper(btrim(coalesce(p_coupon_code, '')));
begin
  if coalesce(cardinality(p_product_ids), 0) = 0 or exists (select 1 from unnest(p_product_ids) product_id group by product_id having count(*) > 1) or p_shipping_cents < 0 or p_selected_source not in ('coupon', 'promotions') and p_selected_source is not null or coalesce(p_identity_key_version, '') !~ '^[A-Za-z0-9._-]{1,32}$' or coalesce(p_identity_fingerprint, '') !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'coupon_quote_input_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coupon-code:' || v_code, 0));
  select definitions.*, versions.discount_kind, versions.discount_bps, versions.fixed_discount_cents into v_coupon from public.coupon_definitions definitions join public.coupon_versions versions on versions.coupon_id = definitions.id and versions.version_number = 1 where definitions.code = v_code for key share of definitions;
  if not found or not v_coupon.is_active or v_coupon.starts_at > pg_catalog.statement_timestamp() or v_coupon.ends_at <= pg_catalog.statement_timestamp() or v_coupon.used_count >= v_coupon.capacity then raise exception using errcode = 'P0001', message = 'coupon_unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coupon-identity:' || v_coupon.id::text || ':' || p_identity_key_version || ':' || p_identity_fingerprint, 0));
  if exists (select 1 from public.coupon_identity_uses where coupon_id = v_coupon.id and key_version = p_identity_key_version and fingerprint = p_identity_fingerprint) then raise exception using errcode = 'P0001', message = 'coupon_identity_already_used'; end if;
  with cart as (select products.id, round(products.price * 100)::bigint as cents, products.product_type_id, products.product_subtype_id from public.products where products.id = any(p_product_ids) and products.status = 'available'), priced as (select cart.cents, coalesce((select campaigns.discount_bps from public.promotion_campaigns campaigns join public.promotion_targets targets on targets.promotion_id = campaigns.id where campaigns.is_active and campaigns.starts_at <= pg_catalog.statement_timestamp() and campaigns.ends_at > pg_catalog.statement_timestamp() and targets.product_type_id = cart.product_type_id and (targets.product_subtype_id is null or targets.product_subtype_id = cart.product_subtype_id) order by campaigns.ends_at asc limit 1), 0) as discount_bps from cart) select count(*), coalesce(sum(cents), 0), coalesce(sum(cents * discount_bps / 10000), 0) into v_products, v_merchandise, v_promotions from priced;
  if v_products <> cardinality(p_product_ids) then raise exception using errcode = 'P0001', message = 'coupon_quote_product_unavailable'; end if;
  v_coupon_discount := case when v_coupon.discount_kind = 'percentage' then v_merchandise * v_coupon.discount_bps / 10000 else least(v_coupon.fixed_discount_cents, v_merchandise / 2) end;
  return query select v_merchandise, p_shipping_cents, v_promotions, v_coupon_discount, 'promotions', coalesce(p_selected_source, 'promotions'), case when v_coupon_discount > v_promotions then 'coupon' else 'promotions' end;
end $fn$;

alter table public.coupon_definitions enable row level security; alter table public.coupon_versions enable row level security; alter table public.coupon_identity_uses enable row level security; alter table public.coupon_audit_events enable row level security;
revoke all on public.coupon_definitions, public.coupon_versions, public.coupon_identity_uses, public.coupon_audit_events from public, anon, authenticated;
revoke execute on function public.create_coupon(text, text, integer, timestamptz, timestamptz, integer, bigint), public.replace_coupon(text, uuid, text, integer, timestamptz, timestamptz, integer, bigint, text), public.quote_coupon_checkout(uuid[], text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.create_coupon(text, text, integer, timestamptz, timestamptz, integer, bigint), public.replace_coupon(text, uuid, text, integer, timestamptz, timestamptz, integer, bigint, text), public.quote_coupon_checkout(uuid[], text, text, text, bigint, text) to service_role, postgres;
commit;
