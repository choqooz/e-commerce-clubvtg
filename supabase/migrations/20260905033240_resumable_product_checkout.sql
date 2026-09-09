begin;

create function public.get_resumable_product_checkout(
  p_user_id text,
  p_product_ids uuid[],
  p_pricing_source text,
  p_coupon_code text,
  p_identity_key_version text,
  p_identity_fingerprint text
) returns table(order_id uuid, preference_id text, reference text)
language plpgsql security definer set search_path = '' as $function$
begin
  if p_user_id is null
    or pg_catalog.btrim(p_user_id) = ''
    or coalesce(pg_catalog.cardinality(p_product_ids), 0) = 0
    or pg_catalog.array_position(p_product_ids, null) is not null
    or pg_catalog.cardinality(p_product_ids) <> (
      select pg_catalog.count(distinct product_id) from pg_catalog.unnest(p_product_ids) as product_id
    )
    or p_pricing_source not in ('promotions', 'coupon')
    or (p_pricing_source = 'promotions' and (p_coupon_code is not null or p_identity_key_version is not null or p_identity_fingerprint is not null))
    or (p_pricing_source = 'coupon' and (
      pg_catalog.upper(pg_catalog.btrim(coalesce(p_coupon_code, ''))) !~ '^[A-Z0-9-]{3,64}$'
      or coalesce(p_identity_key_version, '') !~ '^[A-Za-z0-9._-]{1,32}$'
      or coalesce(p_identity_fingerprint, '') !~ '^[0-9a-f]{64}$'
    )) then
    raise exception using errcode = '22023', message = 'invalid_resumable_product_checkout';
  end if;

  return query
  select orders.id, orders.mp_preference_id, orders.payment_reference
  from public.orders
  where orders.integrity_version = 1
    and orders.purchase_user_id = p_user_id
    and orders.status = 'pending'
    and orders.payment_expires_at > pg_catalog.statement_timestamp()
    and nullif(pg_catalog.btrim(orders.mp_preference_id), '') is not null
    and orders.pricing_source = p_pricing_source
    and (
      (p_pricing_source = 'promotions' and orders.coupon_id is null and orders.coupon_reservation_state = 'none')
      or (
        p_pricing_source = 'coupon'
        and orders.coupon_reservation_state = 'reserved'
        and exists (
          select 1 from public.coupon_definitions as definitions
          where definitions.id = orders.coupon_id
            and definitions.code = pg_catalog.upper(pg_catalog.btrim(p_coupon_code))
        )
        and exists (
          select 1 from public.coupon_checkout_reservations as reservations
          where reservations.order_id = orders.id
            and reservations.coupon_id = orders.coupon_id
            and reservations.key_version = p_identity_key_version
            and reservations.fingerprint = p_identity_fingerprint
            and reservations.reservation_state = 'reserved'
        )
      )
    )
    and (
      select pg_catalog.count(*) from public.order_items as items
      where items.order_id = orders.id
    ) = pg_catalog.cardinality(p_product_ids)
    and (
      select pg_catalog.count(distinct items.product_id) from public.order_items as items
      where items.order_id = orders.id
    ) = pg_catalog.cardinality(p_product_ids)
    and not exists (
      select 1 from pg_catalog.unnest(p_product_ids) as cart(product_id)
      where not exists (
        select 1 from public.order_items as items
        where items.order_id = orders.id and items.product_id = cart.product_id
      )
    )
    and not exists (
      select 1 from public.order_items as items
      where items.order_id = orders.id
        and not exists (
          select 1
          from public.inventory_reservations as reservations
          join public.products on products.id = reservations.product_id
          where reservations.order_id = orders.id
            and reservations.product_id = items.product_id
            and reservations.status = 'active'
            and reservations.expires_at > pg_catalog.statement_timestamp()
            and products.status = 'reserved'::public.product_status
        )
    )
    and not exists (
      select 1 from public.inventory_reservations as reservations
      where reservations.order_id = orders.id
        and reservations.status = 'active'
        and not exists (
          select 1 from public.order_items as items
          where items.order_id = orders.id and items.product_id = reservations.product_id
        )
    )
  order by orders.created_at desc;
end;
$function$;

revoke execute on function public.get_resumable_product_checkout(text, uuid[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_resumable_product_checkout(text, uuid[], text, text, text, text) to service_role, postgres;

commit;
