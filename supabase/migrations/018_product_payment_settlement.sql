-- Strict provider-fact settlement for immutable product checkout authority.
begin;

create or replace function public.settle_product_payment(
  p_provider text,
  p_payment_id text,
  p_event_class text,
  p_reference text,
  p_amount numeric,
  p_currency text
) returns table(order_id uuid, newly_applied boolean, result text)
language plpgsql security definer set search_path = '' as $function$
declare
  v_order public.orders%rowtype;
  v_claim public.payment_claims%rowtype;
  v_product_id uuid;
  v_event_class text;
  v_event_inserted boolean;
  v_reservation_count integer := 0;
begin
  newly_applied := false;
  if p_provider <> 'mercadopago' or p_payment_id is null or pg_catalog.length(pg_catalog.btrim(p_payment_id)) not between 1 and 128 or p_reference is null or pg_catalog.length(pg_catalog.btrim(p_reference)) not between 1 and 256 or p_amount is null or p_amount < 0 or p_currency <> 'ARS' then
    result := 'invalid_payment'; return next; return;
  end if;

  v_event_class := pg_catalog.lower(pg_catalog.btrim(p_event_class));
  if v_event_class is null or v_event_class not in ('approved', 'pending', 'rejected', 'cancelled', 'refunded', 'charged_back') then
    result := 'invalid_event'; return next; return;
  end if;

  insert into public.payment_events (provider, event_key, payment_id)
  values (p_provider, p_payment_id || ':' || v_event_class, p_payment_id)
  on conflict do nothing returning true into v_event_inserted;
  if not coalesce(v_event_inserted, false) then
    result := 'duplicate_event'; return next; return;
  end if;

  select orders.* into v_order
  from public.orders as orders
  where orders.integrity_version = 1 and orders.payment_reference = p_reference
  for update;
  if not found then
    insert into public.payment_manual_reviews (provider, payment_id, review_kind, evidence)
    values (p_provider, p_payment_id, 'unknown_reference', pg_catalog.jsonb_build_object('event_class', v_event_class, 'reference', p_reference))
    on conflict do nothing;
    result := 'unknown_order'; return next; return;
  end if;
  order_id := v_order.id;

  if v_order.payment_amount <> p_amount or v_order.payment_currency <> p_currency then
    insert into public.payment_manual_reviews (provider, payment_id, review_kind, evidence)
    values (p_provider, p_payment_id, 'payment_mismatch', pg_catalog.jsonb_build_object('order_id', v_order.id, 'event_class', v_event_class))
    on conflict do nothing;
    result := 'payment_mismatch'; return next; return;
  end if;

  select claims.* into v_claim from public.payment_claims as claims
  where claims.provider = p_provider and claims.payment_id = p_payment_id
  for update;
  if found and (v_claim.claim_state <> 'active' or v_claim.subject_kind <> 'order' or v_claim.subject_id <> v_order.id) then
    result := 'payment_reused'; return next; return;
  end if;

  if v_event_class = 'pending' then
    result := 'pending_ignored'; return next; return;
  end if;

  if v_event_class in ('refunded', 'charged_back') then
    insert into public.payment_manual_reviews (provider, payment_id, review_kind, evidence)
    values (p_provider, p_payment_id, case when v_event_class = 'refunded' then 'refund' else 'chargeback' end, pg_catalog.jsonb_build_object('order_id', v_order.id, 'event_class', v_event_class))
    on conflict do nothing;
    result := 'manual_review_required'; return next; return;
  end if;

  if v_event_class in ('rejected', 'cancelled') then
    if v_order.status <> 'pending' then
      insert into public.payment_manual_reviews (provider, payment_id, review_kind, evidence)
      values (p_provider, p_payment_id, 'late_terminal_event', pg_catalog.jsonb_build_object('order_id', v_order.id, 'event_class', v_event_class))
      on conflict do nothing;
      result := 'manual_review_required'; return next; return;
    end if;
    if not found then
      insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id)
      values (p_provider, p_payment_id, 'active', 'order', v_order.id);
    end if;
    perform public.cancel_product_order(v_order.id, 'provider_' || v_event_class, 'provider_' || v_event_class);
    result := 'cancelled'; return next; return;
  end if;

  if v_order.status = 'cancelled' then
    if not found then
      insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id)
      values (p_provider, p_payment_id, 'active', 'order', v_order.id);
    end if;
    insert into public.payment_manual_reviews (provider, payment_id, review_kind, evidence)
    values (p_provider, p_payment_id, 'late_approval_refund_required', pg_catalog.jsonb_build_object('order_id', v_order.id, 'reference', p_reference))
    on conflict do nothing;
    result := 'late_approval_manual_review'; return next; return;
  end if;

  if v_order.status <> 'pending' then
    insert into public.payment_manual_reviews (provider, payment_id, review_kind, evidence)
    values (p_provider, p_payment_id, 'illegal_order_state', pg_catalog.jsonb_build_object('order_id', v_order.id, 'status', v_order.status))
    on conflict do nothing;
    result := 'illegal_order_state'; return next; return;
  end if;

  if found then
    result := 'duplicate_payment'; return next; return;
  end if;
  insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id)
  values (p_provider, p_payment_id, 'active', 'order', v_order.id);

  for v_product_id in
    select reservations.product_id from public.inventory_reservations as reservations
    where reservations.order_id = v_order.id and reservations.status = 'active'
    order by reservations.product_id for update
  loop
    perform 1 from public.products as products where products.id = v_product_id and products.status = 'reserved'::public.product_status for update;
    if not found then raise exception using errcode = 'P0001', message = 'reservation_product_not_reserved'; end if;
    update public.inventory_reservations as reservations set status = 'sold', released_at = pg_catalog.now(), release_reason = 'payment_settlement'
    where reservations.order_id = v_order.id and reservations.product_id = v_product_id and reservations.status = 'active';
    if not found then raise exception using errcode = 'P0001', message = 'reservation_transition_failed'; end if;
    update public.products set status = 'sold', reserved_at = null
    where id = v_product_id and status = 'reserved'::public.product_status;
    if not found then raise exception using errcode = 'P0001', message = 'product_sale_transition_failed'; end if;
    v_reservation_count := v_reservation_count + 1;
  end loop;
  if v_reservation_count = 0 then raise exception using errcode = 'P0001', message = 'order_has_no_active_reservations'; end if;

  update public.orders set status = 'paid', mp_payment_id = p_payment_id, updated_at = pg_catalog.now()
  where id = v_order.id and status = 'pending';
  if not found then raise exception using errcode = 'P0001', message = 'order_payment_transition_failed'; end if;
  newly_applied := true; result := 'applied'; return next;
end;
$function$;

revoke execute on function public.settle_product_payment(text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.settle_product_payment(text, text, text, text, numeric, text) to service_role, postgres;
commit;
