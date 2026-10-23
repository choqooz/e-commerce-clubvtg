-- Loaded only into fresh database clones, after EVERY repository migration.
do $guard$ begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end $guard$;

insert into public.product_types (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Synthetic Home');
select public.create_promotion('disposable-home', 1000, now() - interval '1 day',
  now() + interval '1 day', '[{"product_type_id":"10000000-0000-0000-0000-000000000001"}]');
insert into public.products (id, title, slug, price, category, product_type_id)
select md5('home-product-' || g)::uuid, 'Synthetic ' || g, 'synthetic-' || g, 100,
  'Synthetic Home', '10000000-0000-0000-0000-000000000001'::uuid
from generate_series(1, :n) g;

-- One reserved product per expired pending order. No trigger bypass or authority
-- mutation: current constraints validate complete promotion-priced snapshots.
\if :expired
insert into public.profiles (id, email) values ('home-synthetic', 'home@example.invalid');
insert into public.orders (id, user_id, customer_email, customer_name, status,
  total_amount, shipping_fee, shipping_info, integrity_version, purchase_user_id,
  payment_amount, payment_currency, payment_reference, payment_expires_at,
  pricing_source, merchandise_original_cents, merchandise_discount_cents,
  merchandise_final_cents, shipping_cents, total_cents, payment_amount_cents,
  pricing_snapshot_at, coupon_reservation_state, promotion_ids)
select md5('home-order-' || g)::uuid, 'home-synthetic', 'home@example.invalid',
  'Synthetic Home', 'pending', 90, 0, '{"email":"home@example.invalid","fullName":"Synthetic Home"}'::jsonb,
  1, 'home-synthetic', 90, 'ARS', 'order:synthetic-' || g, now() - interval '1 hour',
  'promotions', 10000, 1000, 9000, 0, 9000, 9000, now() - interval '2 hours', 'none',
  array(select id from public.promotion_campaigns)
from generate_series(1, :n) g;
insert into public.order_items (order_id, product_id, price, integrity_version,
  product_title_snapshot, original_cents, discount_cents, final_cents, pricing_source,
  promotion_id, promotion_version_id, discount_bps)
select md5('home-order-' || g)::uuid, md5('home-product-' || g)::uuid, 90, 1,
  'Synthetic ' || g, 10000, 1000, 9000, 'promotions', v.promotion_id, v.id, 1000
from generate_series(1, :n) g cross join public.promotion_versions v;
insert into public.inventory_reservations (order_id, product_id, expires_at)
select md5('home-order-' || g)::uuid, md5('home-product-' || g)::uuid,
  now() - interval '1 hour' from generate_series(1, :n) g;
update public.products set status = 'reserved', reserved_at = now() - interval '2 hours';
\endif

-- Unexposed detector positive control: ONE caller, N distinct nested point reads.
create schema home_probe;
revoke all on schema home_probe from public;
create function home_probe.repeat_lookup(n integer) returns void language plpgsql as $$
declare product_id uuid;
begin
  for product_id in select id from public.products order by id limit n loop
    perform home_positive_control.id from public.products as home_positive_control
    where home_positive_control.id = product_id;
  end loop;
end;
$$;
