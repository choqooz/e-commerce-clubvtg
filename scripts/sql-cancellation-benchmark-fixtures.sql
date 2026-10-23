-- Disposable local baseline only; production migrations and triggers remain unchanged.
do $$ begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end $$;
set pg_stat_statements.track = 'none';
create schema bench;
create function bench.assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception '%', label; end if;
end $$;
insert into public.profiles(id, email) values ('benchmark', 'benchmark@example.invalid');
insert into public.products(id, title, slug, price, category)
select md5('sql-cancellation-v1:' || i)::uuid, 'Benchmark ' || i, 'benchmark-' || i, 100, 'fixture'
from generate_series(1, :n * :m) i;
select public.create_coupon('benchmark', 'BENCH', :n, now() - interval '1h',
  now() + interval '2h', 2500, null) where :'branch' = 'coupon';
create table bench.orders(order_id uuid primary key, fingerprint text);
-- Actual current checkout supplies every order, item, reservation and pricing snapshot.
select set_config('bench.n', :'n', false), set_config('bench.m', :'m', false),
  set_config('bench.branch', :'branch', false);
do $$
declare i integer; ids uuid[]; checkout uuid;
begin
  for i in 1..current_setting('bench.n')::integer loop
    select array_agg(id order by id) into ids from public.products
      where slug in (select 'benchmark-' || j from generate_series(
        (i - 1) * current_setting('bench.m')::integer + 1, i * current_setting('bench.m')::integer) j);
    select order_id into strict checkout from public.create_product_checkout(
      'benchmark', '{"email":"benchmark@example.invalid","fullName":"Benchmark buyer"}', ids, 0,
      current_setting('bench.branch'),
      case when current_setting('bench.branch') = 'coupon' then 'BENCH' end,
      case when current_setting('bench.branch') = 'coupon' then 'v1' end,
      case when current_setting('bench.branch') = 'coupon' then lpad(to_hex(i), 64, '0') end);
    insert into bench.orders values (checkout, lpad(to_hex(i), 64, '0'));
  end loop;
end $$;
create function bench.cancel(ids uuid[]) returns jsonb language plpgsql as $$
declare started timestamptz; elapsed_ms numeric; id uuid; cancelled integer := 0;
begin
  started := clock_timestamp();
  foreach id in array ids loop
    if public.cancel_product_order(id, 'expired', 'expired') then cancelled := cancelled + 1; end if;
  end loop;
  elapsed_ms := extract(epoch from clock_timestamp() - started) * 1000;
  return jsonb_build_object('ms', elapsed_ms, 'cancelled', cancelled);
end $$;
create function bench.work() returns jsonb language sql as $$
  select jsonb_build_object(
    'cancelled', (select count(*) from public.orders where status = 'cancelled'),
    'released', (select count(*) from public.inventory_reservations
      where status = 'released' and released_at is not null and release_reason = 'expired'),
    'available', (select count(*) from public.products where status = 'available' and reserved_at is null),
    'items', (select count(*) from public.order_items where integrity_version = 1),
    'couponEvidence', (select count(*) from public.coupon_reservation_release_evidence e
      join public.orders o on o.id = e.order_id join bench.orders b on b.order_id = e.order_id
      where e.coupon_id = o.coupon_id and e.coupon_version_id = o.coupon_version_id
      and e.key_version = o.identity_key_version and e.fingerprint = b.fingerprint
      and o.coupon_reservation_state = 'released'),
    'couponReservations', (select count(*) from public.coupon_checkout_reservations),
    'usedCount', (select coalesce(sum(used_count), 0) from public.coupon_definitions),
    'authorizations', (select count(*) from public.order_status_transition_authorizations)
      + (select count(*) from public.coupon_used_count_authorizations),
    'identityUses', (select count(*) from public.coupon_identity_uses))
$$;
-- Fingerprint every logical authority row, not MVCC physical row versions.
create function bench.fingerprint() returns text language plpgsql as $$
declare relation text; digest text; result text := '';
begin
  foreach relation in array array['orders', 'order_items', 'inventory_reservations', 'products',
    'coupon_definitions', 'coupon_checkout_reservations', 'coupon_reservation_release_evidence',
    'order_status_transition_authorizations', 'coupon_used_count_authorizations', 'coupon_identity_uses'] loop
    execute format('select md5(coalesce(string_agg(t::text, '''' order by t::text), '''')) from public.%I t', relation)
      into digest;
    result := result || digest;
  end loop;
  return md5(result);
end $$;
create function bench.control(repetitions integer, product uuid) returns void language plpgsql as $$
begin
  for i in 1..repetitions loop
    perform price from public.products where id = product /* cancellation_positive_control */;
  end loop;
end $$;
select bench.assert((select count(*) = :n from public.orders where status = 'pending'
  and integrity_version = 1 and pricing_source = :'branch'
  and merchandise_original_cents = :m * 10000
  and merchandise_discount_cents = case when :'branch' = 'coupon' then :m * 2500 else 0 end), 'checkout_orders');
select bench.assert((select count(*) = :n * :m from public.inventory_reservations r
  join public.products p on p.id = r.product_id join public.order_items i
  on i.order_id = r.order_id and i.product_id = r.product_id
  where r.status = 'active' and p.status = 'reserved' and r.expires_at > now()
  and i.original_cents = 10000 and i.final_cents = case when :'branch' = 'coupon' then 7500 else 10000 end),
  'checkout_inventory_and_pricing');
select bench.assert((select coalesce(sum(used_count), 0) = case when :'branch' = 'coupon' then :n else 0 end
  from public.coupon_definitions), 'checkout_coupon_counter');
analyze public.orders;
analyze public.order_items;
analyze public.products;
analyze public.inventory_reservations;
