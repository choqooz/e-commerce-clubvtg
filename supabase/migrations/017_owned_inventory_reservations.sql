-- Atomic authenticated checkout and order-owned inventory reservations.
begin;
create table if not exists public.inventory_reservations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'released', 'sold')),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  unique (order_id, product_id),
  check ((status = 'active' and released_at is null) or (status in ('released', 'sold') and released_at is not null))
);
alter table public.inventory_reservations enable row level security;
create unique index if not exists inventory_reservations_one_active_product on public.inventory_reservations (product_id) where status = 'active';
create index if not exists inventory_reservations_expiry on public.inventory_reservations (expires_at) where status = 'active';
create or replace function public.prevent_order_checkout_authority_mutation() returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.integrity_version = 1 and (new.user_id, new.purchase_user_id, new.total_amount, new.shipping_fee, new.shipping_info, new.payment_amount, new.payment_currency, new.payment_reference, new.payment_expires_at) is distinct from (old.user_id, old.purchase_user_id, old.total_amount, old.shipping_fee, old.shipping_info, old.payment_amount, old.payment_currency, old.payment_reference, old.payment_expires_at) then
    raise exception using errcode = 'P0001', message = 'immutable_product_checkout_authority';
  end if;
  return new;
end;
$function$;
drop trigger if exists orders_checkout_authority_immutable on public.orders;
create trigger orders_checkout_authority_immutable before update on public.orders for each row execute function public.prevent_order_checkout_authority_mutation();
create or replace function public.prevent_order_item_checkout_authority_mutation() returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.integrity_version = 1 and (new.order_id, new.product_id, new.price, new.product_title_snapshot) is distinct from (old.order_id, old.product_id, old.price, old.product_title_snapshot) then
    raise exception using errcode = 'P0001', message = 'immutable_product_order_item_authority';
  end if;
  return new;
end;
$function$;
drop trigger if exists order_items_checkout_authority_immutable on public.order_items;
create trigger order_items_checkout_authority_immutable before update on public.order_items for each row execute function public.prevent_order_item_checkout_authority_mutation();
create or replace function public.create_product_checkout(p_user_id text, p_shipping_info jsonb, p_product_ids uuid[], p_shipping_fee numeric)
returns table(order_id uuid, reference text, expires_at timestamptz, preference_items jsonb) language plpgsql security definer set search_path = '' as $function$
declare
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_count integer := 0;
  v_total numeric := p_shipping_fee;
  v_reference text := 'order:' || pg_catalog.gen_random_uuid()::text;
begin
  if p_user_id is null or pg_catalog.btrim(p_user_id) = '' or p_shipping_info is null or pg_catalog.jsonb_typeof(p_shipping_info) <> 'object' or nullif(pg_catalog.btrim(p_shipping_info ->> 'email'), '') is null or nullif(pg_catalog.btrim(p_shipping_info ->> 'fullName'), '') is null or p_shipping_fee is null or p_shipping_fee < 0 or p_product_ids is null or pg_catalog.cardinality(p_product_ids) = 0 or pg_catalog.array_position(p_product_ids, null) is not null or pg_catalog.cardinality(p_product_ids) <> (select count(distinct product_id) from pg_catalog.unnest(p_product_ids) as product_id) then
    raise exception using errcode = 'P0001', message = 'invalid_product_checkout';
  end if;
  perform 1 from public.profiles as profiles where profiles.id = p_user_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'user_profile_not_found'; end if;
  for v_product in select * from public.products as products where products.id = any(p_product_ids) order by products.id for update loop
    v_count := v_count + 1;
    if v_product.status <> 'available'::public.product_status then raise exception using errcode = 'P0001', message = 'product_not_available'; end if;
    v_total := v_total + v_product.price;
  end loop;
  if v_count <> pg_catalog.cardinality(p_product_ids) then raise exception using errcode = 'P0001', message = 'product_not_found'; end if;
  insert into public.orders (user_id, customer_email, customer_name, status, total_amount, shipping_fee, shipping_info, integrity_version, purchase_user_id, payment_amount, payment_currency, payment_reference, payment_expires_at)
  values (p_user_id, p_shipping_info ->> 'email', p_shipping_info ->> 'fullName', 'pending', v_total, p_shipping_fee, p_shipping_info, 1, p_user_id, v_total, 'ARS', v_reference, pg_catalog.now() + pg_catalog.make_interval(mins => 15)) returning * into v_order;
  for v_product in select * from public.products as products where products.id = any(p_product_ids) order by products.id loop
    insert into public.order_items (order_id, product_id, price, integrity_version, product_title_snapshot) values (v_order.id, v_product.id, v_product.price, 1, v_product.title);
    insert into public.inventory_reservations (order_id, product_id, expires_at) values (v_order.id, v_product.id, v_order.payment_expires_at);
    update public.products set status = 'reserved', reserved_at = pg_catalog.now() where id = v_product.id and status = 'available'::public.product_status;
    if not found then raise exception using errcode = 'P0001', message = 'product_reservation_conflict'; end if;
  end loop;
  order_id := v_order.id; reference := v_order.payment_reference; expires_at := v_order.payment_expires_at;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', items.product_id, 'title', items.product_title_snapshot, 'price', items.price) order by items.product_id) into preference_items from public.order_items as items where items.order_id = v_order.id;
  return next;
end;
$function$;
create or replace function public.attach_order_preference(p_order_id uuid, p_preference_id text, p_expires_at timestamptz) returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  update public.orders set mp_preference_id = p_preference_id where id = p_order_id and integrity_version = 1 and status = 'pending' and mp_preference_id is null and payment_expires_at = p_expires_at and payment_expires_at > pg_catalog.now() and nullif(pg_catalog.btrim(p_preference_id), '') is not null;
  return found;
end;
$function$;
create or replace function public.cancel_product_order(p_order_id uuid, p_reason text, p_release_reason text) returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_product_id uuid;
begin
  update public.orders set status = 'cancelled', updated_at = pg_catalog.now() where id = p_order_id and integrity_version = 1 and status = 'pending';
  if not found then return false; end if;
  for v_product_id in select reservations.product_id from public.inventory_reservations as reservations where reservations.order_id = p_order_id and reservations.status = 'active' order by reservations.product_id for update loop
    perform 1 from public.products as products where products.id = v_product_id for update;
    update public.inventory_reservations set status = 'released', released_at = pg_catalog.now(), release_reason = nullif(pg_catalog.btrim(p_release_reason), '') where order_id = p_order_id and product_id = v_product_id and status = 'active';
    update public.products set status = 'available', reserved_at = null where id = v_product_id and status = 'reserved'::public.product_status;
  end loop;
  return true;
end;
$function$;
create or replace function public.expire_product_reservations(p_now timestamptz, p_limit integer) returns integer language plpgsql security definer set search_path = '' as $function$
declare v_order_id uuid; v_expired integer := 0;
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 100 then raise exception using errcode = 'P0001', message = 'invalid_expiry_request'; end if;
  for v_order_id in select orders.id from public.orders as orders where orders.integrity_version = 1 and orders.status = 'pending' and orders.payment_expires_at <= p_now order by orders.id for update skip locked limit p_limit loop
    if public.cancel_product_order(v_order_id, 'expired', 'expired') then v_expired := v_expired + 1; end if;
  end loop;
  return v_expired;
end;
$function$;
revoke execute on function public.prevent_order_checkout_authority_mutation(), public.prevent_order_item_checkout_authority_mutation(), public.create_product_checkout(text, jsonb, uuid[], numeric), public.attach_order_preference(uuid, text, timestamptz), public.cancel_product_order(uuid, text, text), public.expire_product_reservations(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.create_product_checkout(text, jsonb, uuid[], numeric), public.attach_order_preference(uuid, text, timestamptz), public.cancel_product_order(uuid, text, text), public.expire_product_reservations(timestamptz, integer) to service_role, postgres;
commit;
