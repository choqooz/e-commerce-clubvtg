begin;
create table public.product_payment_reversal_evidence (order_id uuid not null references public.orders(id) on delete restrict, provider text not null, payment_id text not null, event_class text not null check (event_class in ('refunded', 'charged_back')), reversal_total_cents bigint not null check (reversal_total_cents > 0), created_at timestamptz not null default now(), primary key (provider, payment_id, event_class, reversal_total_cents));
create table public.coupon_reservation_release_evidence (order_id uuid primary key references public.orders(id) on delete restrict, coupon_id uuid not null references public.coupon_definitions(id) on delete restrict, coupon_version_id uuid not null references public.coupon_versions(id) on delete restrict, key_version text not null, fingerprint text not null, released_at timestamptz not null default now());
create table public.order_status_transition_authorizations (order_id uuid primary key references public.orders(id) on delete cascade, from_status text, to_status text, from_coupon_reservation_state text, to_coupon_reservation_state text, created_at timestamptz not null default now(), check ((from_status is not null and to_status is not null and from_status <> to_status and from_coupon_reservation_state is null and to_coupon_reservation_state is null) or (from_status is null and to_status is null and from_coupon_reservation_state in ('reserved', 'consumed', 'released', 'expired') and to_coupon_reservation_state in ('reserved', 'consumed', 'released', 'expired') and from_coupon_reservation_state <> to_coupon_reservation_state)));
create table public.coupon_used_count_authorizations (order_id uuid primary key references public.orders(id) on delete cascade, coupon_id uuid not null references public.coupon_definitions(id) on delete restrict, expected_used_count integer not null check (expected_used_count >= 0), next_used_count integer not null check (next_used_count >= 0 and next_used_count in (expected_used_count - 1, expected_used_count + 1)), created_at timestamptz not null default now());
alter table public.product_payment_reversal_evidence enable row level security;
alter table public.coupon_reservation_release_evidence enable row level security;
alter table public.order_status_transition_authorizations enable row level security;
alter table public.coupon_used_count_authorizations enable row level security;
revoke all on public.product_payment_reversal_evidence, public.coupon_reservation_release_evidence, public.order_status_transition_authorizations, public.coupon_used_count_authorizations from public, anon, authenticated, service_role;
create or replace function public.get_order_history_reversal_evidence(p_order_ids uuid[]) returns table(order_id uuid, event_class text, reversal_total_cents bigint, created_at timestamptz) language sql security definer set search_path = '' as $function$ select evidence.order_id, evidence.event_class, evidence.reversal_total_cents, evidence.created_at from public.product_payment_reversal_evidence evidence where evidence.order_id = any(p_order_ids) $function$;
revoke execute on function public.get_order_history_reversal_evidence(uuid[]) from public, anon, authenticated;
grant execute on function public.get_order_history_reversal_evidence(uuid[]) to service_role, postgres;
alter table public.orders drop constraint orders_discount_snapshot_check;
alter table public.orders add constraint orders_discount_snapshot_check check (integrity_version = 0 or (pricing_source in ('promotions', 'coupon') and merchandise_original_cents >= 0 and merchandise_discount_cents between 0 and merchandise_original_cents and merchandise_final_cents = merchandise_original_cents - merchandise_discount_cents and shipping_cents >= 0 and total_cents = merchandise_final_cents + shipping_cents and payment_amount_cents = total_cents and pricing_snapshot_at is not null and ((pricing_source = 'promotions' and coupon_id is null and coupon_reservation_state = 'none') or (pricing_source = 'coupon' and coupon_id is not null and coupon_version_id is not null and coupon_discount_cents = merchandise_discount_cents and identity_key_version is not null and coupon_reservation_state in ('reserved', 'consumed', 'released', 'expired')))));

create or replace function public.prevent_order_checkout_authority_mutation() returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.integrity_version = 1 and (new.user_id, new.purchase_user_id, new.total_amount, new.shipping_fee, new.shipping_info, new.payment_amount, new.payment_currency, new.payment_reference, new.payment_expires_at, new.pricing_source, new.promotion_ids, new.coupon_id, new.coupon_version_id, new.coupon_discount_bps, new.coupon_fixed_discount_cents, new.coupon_starts_at, new.coupon_ends_at, new.coupon_discount_cents, new.merchandise_original_cents, new.merchandise_discount_cents, new.merchandise_final_cents, new.shipping_cents, new.total_cents, new.payment_amount_cents, new.pricing_snapshot_at, new.identity_key_version) is distinct from (old.user_id, old.purchase_user_id, old.total_amount, old.shipping_fee, old.shipping_info, old.payment_amount, old.payment_currency, old.payment_reference, old.payment_expires_at, old.pricing_source, old.promotion_ids, old.coupon_id, old.coupon_version_id, old.coupon_discount_bps, old.coupon_fixed_discount_cents, old.coupon_starts_at, old.coupon_ends_at, old.coupon_discount_cents, old.merchandise_original_cents, old.merchandise_discount_cents, old.merchandise_final_cents, old.shipping_cents, old.total_cents, old.payment_amount_cents, old.pricing_snapshot_at, old.identity_key_version) then raise exception using errcode = 'P0001', message = 'immutable_product_checkout_authority'; end if;
  return new;
end;
$function$;
create or replace function public.require_order_status_transition_authorization() returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.integrity_version = 1 then
    delete from public.order_status_transition_authorizations where order_id = old.id and from_status = old.status and to_status = new.status;
    if not found then raise exception using errcode = 'P0001', message = 'order_status_transition_not_authorized'; end if;
  end if;
  return new;
end;
$function$;
create trigger order_status_transition_guard before update of status on public.orders for each row execute function public.require_order_status_transition_authorization();
create or replace function public.require_coupon_reservation_state_transition_authorization() returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.integrity_version = 1 then
    delete from public.order_status_transition_authorizations
      where order_id = old.id
        and from_status is null
        and to_status is null
        and from_coupon_reservation_state = old.coupon_reservation_state
        and to_coupon_reservation_state = new.coupon_reservation_state;
    if not found then raise exception using errcode = 'P0001', message = 'coupon_reservation_state_transition_not_authorized'; end if;
  end if;
  return new;
end;
$function$;
create trigger order_coupon_reservation_state_transition_guard before update of coupon_reservation_state on public.orders for each row execute function public.require_coupon_reservation_state_transition_authorization();
create or replace function public.guard_coupon_definition_update() returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.code <> old.code or new.capacity <> old.capacity or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at or new.created_at <> old.created_at then raise exception using errcode = 'P0001', message = 'coupon_terms_immutable'; end if;
  if not old.is_active and new.is_active then raise exception using errcode = 'P0001', message = 'coupon_reactivation_forbidden'; end if;
  if old.is_active and new.is_active then if new.deactivated_at is not null or new.deactivation_reason is not null then raise exception using errcode = 'P0001', message = 'coupon_deactivation_fields_invalid'; end if; return new; end if;
  if old.is_active and new.used_count <> old.used_count then raise exception using errcode = 'P0001', message = 'coupon_used_count_immutable'; end if;
  if old.is_active and (new.deactivated_at is null or btrim(coalesce(new.deactivation_reason, '')) = '') then raise exception using errcode = 'P0001', message = 'coupon_deactivation_reason_required'; end if;
  if not old.is_active then
    if (new.deactivated_at, new.deactivation_reason) is distinct from (old.deactivated_at, old.deactivation_reason) then raise exception using errcode = 'P0001', message = 'coupon_deactivation_immutable'; end if;
  end if;
  return new;
end;
$function$;
create function public.guard_coupon_used_count_update() returns trigger language plpgsql set search_path = '' as $function$ begin if new.used_count = old.used_count then raise exception using errcode = 'P0001', message = 'coupon_used_count_not_authorized'; end if; if new.used_count not in (old.used_count - 1, old.used_count + 1) then raise exception using errcode = 'P0001', message = 'coupon_used_count_immutable'; end if; delete from public.coupon_used_count_authorizations as authorizations using public.orders as orders where authorizations.coupon_id = old.id and authorizations.expected_used_count = old.used_count and authorizations.next_used_count = new.used_count and orders.id = authorizations.order_id and orders.coupon_id = old.id and orders.coupon_reservation_state = 'reserved'; if not found then raise exception using errcode = 'P0001', message = 'coupon_used_count_not_authorized'; end if; return new; end; $function$;
create trigger coupon_used_count_guard before update of used_count on public.coupon_definitions for each row execute function public.guard_coupon_used_count_update();
create or replace function public.authorize_coupon_checkout_reservation() returns trigger language plpgsql set search_path = '' as $function$
begin if new.integrity_version = 1 and new.coupon_id is not null and new.coupon_reservation_state = 'reserved' then insert into public.coupon_used_count_authorizations (order_id, coupon_id, expected_used_count, next_used_count) select new.id, definitions.id, definitions.used_count, definitions.used_count + 1 from public.coupon_definitions definitions where definitions.id = new.coupon_id; end if; return new; end;
$function$;
create trigger coupon_checkout_reservation_authorization after insert on public.orders for each row execute function public.authorize_coupon_checkout_reservation();

create or replace function public.cancel_product_order(p_order_id uuid, p_reason text, p_release_reason text) returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_product_id uuid; v_coupon record; v_coupon_used_count integer;
begin
  perform 1 from public.orders where id = p_order_id and integrity_version = 1 and status = 'pending' for update; if not found then return false; end if;
  insert into public.order_status_transition_authorizations (order_id, from_status, to_status) values (p_order_id, 'pending', 'cancelled') on conflict do nothing;
  update public.orders set status = 'cancelled', updated_at = pg_catalog.now() where id = p_order_id and integrity_version = 1 and status = 'pending'; if not found then raise exception using errcode = 'P0001', message = 'order_cancellation_transition_failed'; end if;
  for v_product_id in select product_id from public.inventory_reservations where order_id = p_order_id and status = 'active' order by product_id for update loop
    perform 1 from public.products where id = v_product_id for update;
    update public.inventory_reservations set status = 'released', released_at = pg_catalog.now(), release_reason = nullif(pg_catalog.btrim(p_release_reason), '') where order_id = p_order_id and product_id = v_product_id and status = 'active';
    update public.products set status = 'available', reserved_at = null where id = v_product_id and status = 'reserved'::public.product_status;
  end loop;
  delete from public.coupon_checkout_reservations where order_id = p_order_id and reservation_state = 'reserved' returning coupon_id, coupon_version_id, key_version, fingerprint into v_coupon;
  if found then
    insert into public.coupon_reservation_release_evidence (order_id, coupon_id, coupon_version_id, key_version, fingerprint) values (p_order_id, v_coupon.coupon_id, v_coupon.coupon_version_id, v_coupon.key_version, v_coupon.fingerprint);
    select used_count into v_coupon_used_count from public.coupon_definitions where id = v_coupon.coupon_id for update;
    if v_coupon_used_count is null or v_coupon_used_count < 1 then raise exception using errcode = 'P0001', message = 'coupon_release_accounting_failed'; end if;
    insert into public.coupon_used_count_authorizations (order_id, coupon_id, expected_used_count, next_used_count) values (p_order_id, v_coupon.coupon_id, v_coupon_used_count, v_coupon_used_count - 1);
    update public.coupon_definitions set used_count = used_count - 1 where id = v_coupon.coupon_id and used_count > 0;
    if not found then raise exception using errcode = 'P0001', message = 'coupon_release_accounting_failed'; end if;
    insert into public.order_status_transition_authorizations (order_id, from_coupon_reservation_state, to_coupon_reservation_state)
    values (p_order_id, 'reserved', 'released');
    update public.orders set coupon_reservation_state = 'released' where id = p_order_id and coupon_reservation_state = 'reserved';
    if not found then raise exception using errcode = 'P0001', message = 'coupon_reservation_state_transition_failed'; end if;
  end if;
  return true;
end;
$function$;

create or replace function public.settle_product_payment(p_provider text, p_payment_id text, p_event_class text, p_reference text, p_amount numeric, p_currency text, p_reversal_total numeric) returns table(order_id uuid, newly_applied boolean, result text) language plpgsql security definer set search_path = '' as $function$
declare v_base record; v_coupon record; v_reversal_cents bigint; v_payment_cents bigint; v_order public.orders%rowtype; v_paid_authorized boolean := false;
begin
  if p_provider <> 'mercadopago' or p_amount is null or p_amount <= 0 or p_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or p_amount * 100 <> trunc(p_amount * 100) then newly_applied := false; result := 'invalid_payment'; return next; return; end if;
  v_payment_cents := (p_amount * 100)::bigint;
  if p_event_class in ('refunded', 'charged_back') then
    if p_reversal_total is null or p_reversal_total <= 0 or p_reversal_total in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or p_reversal_total * 100 <> trunc(p_reversal_total * 100) then newly_applied := false; result := 'invalid_payment'; return next; return; end if;
    v_reversal_cents := (p_reversal_total * 100)::bigint;
    select * into v_order from public.orders where integrity_version = 1 and payment_reference = p_reference for update;
    if not found or v_order.payment_amount_cents <> v_payment_cents or v_order.payment_currency <> p_currency or v_reversal_cents > v_order.payment_amount_cents or v_order.mp_payment_id <> p_payment_id then
      newly_applied := false; result := 'payment_mismatch'; return next; return;
    end if;
    insert into public.product_payment_reversal_evidence (order_id, provider, payment_id, event_class, reversal_total_cents) values (v_order.id, p_provider, p_payment_id, p_event_class, v_reversal_cents) on conflict do nothing;
    order_id := v_order.id; newly_applied := false; result := 'manual_review_required'; return next; return;
  end if;
  if pg_catalog.lower(pg_catalog.btrim(p_event_class)) = 'approved' then
    select * into v_order from public.orders where integrity_version = 1 and payment_reference = p_reference and status = 'pending' and payment_expires_at > pg_catalog.now() for update;
    if found then insert into public.order_status_transition_authorizations (order_id, from_status, to_status) values (v_order.id, 'pending', 'paid'); v_paid_authorized := true; end if;
  elsif pg_catalog.lower(pg_catalog.btrim(p_event_class)) in ('rejected', 'cancelled') then select * into v_order from public.orders where integrity_version = 1 and payment_reference = p_reference and status = 'pending' for update; if found then insert into public.order_status_transition_authorizations (order_id, from_status, to_status) values (v_order.id, 'pending', 'cancelled'); end if;
  end if;
  select * into v_base from public.settle_product_payment(p_provider, p_payment_id, p_event_class, p_reference, p_amount, p_currency);
  order_id := v_base.order_id; newly_applied := v_base.newly_applied; result := v_base.result;
  if v_base.newly_applied then
    select * into v_coupon from public.coupon_checkout_reservations as reservations where reservations.order_id = v_base.order_id and reservations.reservation_state = 'reserved' for update;
    if found then
      insert into public.coupon_identity_uses (coupon_id, key_version, fingerprint) values (v_coupon.coupon_id, v_coupon.key_version, v_coupon.fingerprint) on conflict do nothing;
      if not found then raise exception using errcode = 'P0001', message = 'coupon_identity_consume_failed'; end if;
      update public.coupon_checkout_reservations as reservations set reservation_state = 'consumed' where reservations.order_id = v_base.order_id and reservations.reservation_state = 'reserved';
      insert into public.order_status_transition_authorizations (order_id, from_coupon_reservation_state, to_coupon_reservation_state)
      values (v_base.order_id, 'reserved', 'consumed');
      update public.orders set coupon_reservation_state = 'consumed' where id = v_base.order_id and coupon_reservation_state = 'reserved';
      if not found then raise exception using errcode = 'P0001', message = 'coupon_reservation_state_transition_failed'; end if;
    end if;
  end if;
  if v_paid_authorized or pg_catalog.lower(pg_catalog.btrim(p_event_class)) in ('rejected', 'cancelled') then delete from public.order_status_transition_authorizations as authorizations where authorizations.order_id = v_order.id; end if;
  return next;
end;
$function$;

create or replace function public.ship_product_order(p_order_id uuid, p_tracking_number text) returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_order public.orders%rowtype; v_tracking_number text := nullif(pg_catalog.btrim(p_tracking_number), '');
begin
  if v_tracking_number is null then return false; end if;
  select * into v_order from public.orders where id = p_order_id and integrity_version = 1 for update; if not found then return false; end if;
  if v_order.status = 'shipped' then return v_order.tracking_number = v_tracking_number; end if;
  if v_order.status <> 'paid' then return false; end if;
  insert into public.order_status_transition_authorizations (order_id, from_status, to_status) values (p_order_id, 'paid', 'shipped');
  update public.orders set status = 'shipped', tracking_number = v_tracking_number, shipped_at = pg_catalog.now(), updated_at = pg_catalog.now() where id = p_order_id and status = 'paid';
  if not found then raise exception using errcode = 'P0001', message = 'order_shipping_transition_failed'; end if;
  return true;
end;
$function$;
revoke execute on function public.cancel_product_order(uuid,text,text), public.settle_product_payment(text,text,text,text,numeric,text), public.settle_product_payment(text,text,text,text,numeric,text,numeric), public.ship_product_order(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.cancel_product_order(uuid,text,text), public.settle_product_payment(text,text,text,text,numeric,text,numeric), public.ship_product_order(uuid,text) to service_role, postgres;
commit;
