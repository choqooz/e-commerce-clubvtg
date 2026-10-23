-- Current migrations, disposable PostgreSQL only; never replace production authority.
do $guard$ begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end $guard$;
set statement_timeout = '25s';
create extension if not exists dblink;
create schema expiry_proof;
create function expiry_proof.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if not coalesce(ok, false) then raise exception '%', label; end if;
end $$;

-- Poll actual blocker identity, not elapsed sleeps or dblink_is_busy alone.
create function expiry_proof.blocked(waiter integer, blocker integer, budget interval default '5s')
returns void language plpgsql as $$
declare deadline timestamptz := clock_timestamp() + budget;
begin
  loop
    if blocker = any(pg_blocking_pids(waiter)) then return; end if;
    if clock_timestamp() >= deadline then raise exception 'blocked_overlap_not_observed'; end if;
    perform pg_sleep(0.01);
  end loop;
end $$;
create function expiry_proof.finish(connection text) returns text language plpgsql as $$
declare deadline timestamptz := clock_timestamp() + interval '8s'; outcome text;
begin
  while dblink_is_busy(connection) = 1 loop
    if clock_timestamp() >= deadline then raise exception 'remote_completion_timeout'; end if;
    perform pg_sleep(0.01);
  end loop;
  select value into outcome from dblink_get_result(connection) as result(value text);
  perform * from dblink_get_result(connection) as result(value text);
  return outcome;
end $$;

-- A local advisory gate pauses real functions only AFTER they own their rows.
-- All production authorization/immutability triggers remain enabled.
create function expiry_proof.gate() returns trigger language plpgsql as $$ begin
  if current_setting('expiry_proof.gated', true) = 'on' then
    perform pg_advisory_xact_lock(36036);
  end if;
  return new;
end $$;
create trigger expiry_proof_payment_gate after update of status on public.products
for each row when (new.status = 'sold') execute function expiry_proof.gate();
create trigger expiry_proof_release_gate after update of coupon_reservation_state on public.orders
for each row when (new.coupon_reservation_state = 'released') execute function expiry_proof.gate();

create function expiry_proof.checkout(product uuid, coupon text, fingerprint text)
returns text language plpgsql as $$
declare checkout_order uuid;
begin
  select order_id into checkout_order from public.create_product_checkout(
    'expiry_buyer', '{"email":"buyer@example.invalid","fullName":"Proof buyer"}',
    array[product], 0, case when coupon is null then 'promotions' else 'coupon' end,
    coupon, case when coupon is not null then 'v1' end, fingerprint);
  return checkout_order::text;
exception when others then
  if sqlerrm = 'product_not_available' then return sqlerrm; end if;
  raise;
end $$;
insert into public.profiles(id, email) values ('expiry_buyer', 'buyer@example.invalid');
insert into public.products(id, title, slug, price, category)
select ('36000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'Expiry proof ' || n, 'expiry-proof-' || n, 100, 'fixture'
from generate_series(1, 3) n;
select public.create_coupon('proof', 'EXP' || n, 1, now() - interval '1h',
  now() + interval '2h', 5000, null) from generate_series(1, 3) n;
create temp table fixtures as
select n, products.id as product
from generate_series(1, 3) n join public.products
on products.slug = 'expiry-proof-' || n;

-- Fixture statements above commit before remote sessions consume them.
do $proof$
declare
  fixture record; original public.orders%rowtype; replacement uuid; owned_order uuid;
  a_pid integer; b_pid integer; outcome text; payment text; settlement text;
  cleanup_deadline timestamptz;
begin
  perform dblink_connect('expiry_a', current_setting('app.disposable_dblink_connection'));
  perform dblink_connect('expiry_b', current_setting('app.disposable_dblink_connection'));
  perform dblink_exec('expiry_a', 'set statement_timeout = ''12s''');
  perform dblink_exec('expiry_b', 'set statement_timeout = ''12s''');
  select pid into a_pid from dblink('expiry_a', 'select pg_backend_pid()') as r(pid integer);
  select pid into b_pid from dblink('expiry_b', 'select pg_backend_pid()') as r(pid integer);
  -- Negative control: idle sessions must NOT count as overlapping/blocked.
  begin
    perform expiry_proof.blocked(b_pid, a_pid, interval '50ms');
    raise exception 'idle_sessions_falsely_reported_blocked';
  exception when others then
    if sqlerrm <> 'blocked_overlap_not_observed' then raise; end if;
  end;
  for fixture in select * from fixtures order by n loop
    if fixture.n = 3 then perform dblink_exec('expiry_a', 'begin'); end if;
    select id into owned_order from dblink('expiry_a', format(
      'select expiry_proof.checkout(%L, %L, %L)', fixture.product, 'EXP' || fixture.n, repeat('a', 64))) as r(id uuid);
    if fixture.n = 3 then
      -- A real checkout holds its product lock until commit: B cannot steal it.
      perform dblink_send_query('expiry_b', format('select expiry_proof.checkout(%L, null, null)', fixture.product));
      perform expiry_proof.blocked(b_pid, a_pid);
      perform dblink_exec('expiry_a', 'commit');
      perform expiry_proof.assert_true(expiry_proof.finish('expiry_b') = 'product_not_available', 'active_owner_must_reject_checkout');
    end if;
    select * into original from public.orders where id = owned_order;
    payment := 'expiry-payment-' || fixture.n;
    settlement := format('select result || '':'' || newly_applied::text from public.settle_product_payment(''mercadopago'', %L, ''approved'', %L, 50, ''ARS'', null)',
      payment, original.payment_reference);
    if fixture.n = 3 then
      perform expiry_proof.assert_true(
        (select count(*) = 1 from public.inventory_reservations where product_id = fixture.product and status = 'active')
        and (select status = 'active' from public.inventory_reservations where order_id = original.id)
        and (select used_count = 1 from public.coupon_definitions where id = original.coupon_id),
        'failed_checkout_must_preserve_original_ownership_and_coupon');
    end if;
    perform pg_advisory_lock(36036);
    perform dblink_exec('expiry_a', 'set expiry_proof.gated = ''on''');
    if fixture.n = 1 then
      perform dblink_send_query('expiry_a', settlement);
    else
      perform dblink_send_query('expiry_a', 'select public.expire_product_reservations(now() + interval ''1h'', 1)');
    end if;
    perform expiry_proof.blocked(a_pid, pg_backend_pid());
    if fixture.n = 1 then
      -- p_now is deliberately future-dated: settlement still uses the real clock.
      perform expiry_proof.assert_true(public.expire_product_reservations(now() + interval '1h', 1) = 0,
        'expiry_call_completed_while_payment_owned_order');
      perform expiry_proof.assert_true(
        (select status = 'pending' and coupon_reservation_state = 'reserved' from public.orders where id = original.id)
        and not exists(select 1 from public.coupon_reservation_release_evidence where order_id = original.id),
        'skip_locked_must_not_cancel_payment_locked_order');
    elsif fixture.n = 2 then
      perform dblink_send_query('expiry_b', settlement);
      perform expiry_proof.blocked(b_pid, a_pid);
    else
      perform dblink_send_query('expiry_b', format('select expiry_proof.checkout(%L, %L, %L)',
        fixture.product, 'EXP3', repeat('b', 64)));
      perform expiry_proof.blocked(b_pid, a_pid);
    end if;
    perform pg_advisory_unlock(36036);
    outcome := expiry_proof.finish('expiry_a');
    perform dblink_exec('expiry_a', 'set expiry_proof.gated = ''off''');
    if fixture.n = 1 then
      perform expiry_proof.assert_true(outcome = 'applied:true', 'payment_winner_must_apply');
      perform expiry_proof.assert_true(
        (select status = 'paid' and coupon_reservation_state = 'consumed' and mp_payment_id = payment from public.orders where id = original.id)
        and (select status = 'sold' from public.products where id = fixture.product)
        and (select status = 'sold' and release_reason = 'payment_settlement' from public.inventory_reservations where order_id = original.id)
        and (select reservation_state = 'consumed' from public.coupon_checkout_reservations where order_id = original.id)
        and (select used_count = 1 from public.coupon_definitions where id = original.coupon_id)
        and exists(select 1 from public.coupon_identity_uses where coupon_id = original.coupon_id)
        and not exists(select 1 from public.payment_manual_reviews where payment_id = payment),
        'payment_winner_inventory_coupon_and_evidence');
    else
      perform expiry_proof.assert_true(outcome = '1', 'expiry_winner_must_cancel_one');
      outcome := expiry_proof.finish('expiry_b');
      if fixture.n = 3 then
        replacement := outcome::uuid;
        select result || ':' || newly_applied::text into outcome from public.settle_product_payment('mercadopago', payment,
          'approved', original.payment_reference, 50, 'ARS', null);
      end if;
      perform expiry_proof.assert_true(outcome = 'late_approval_manual_review:false', 'expiry_winner_late_approval_result');
      perform expiry_proof.assert_true(
        (select status = 'cancelled' and coupon_reservation_state = 'released' and mp_payment_id is null from public.orders where id = original.id)
        and (select status = 'released' and release_reason = 'expired' from public.inventory_reservations where order_id = original.id)
        and not exists(select 1 from public.coupon_checkout_reservations where order_id = original.id)
        and exists(select 1 from public.coupon_reservation_release_evidence where order_id = original.id
          and coupon_id = original.coupon_id and fingerprint = repeat('a', 64))
        and exists(select 1 from public.payment_manual_reviews where payment_id = payment
          and review_kind = 'late_approval_refund_required' and evidence->>'order_id' = original.id::text)
        and exists(select 1 from public.payment_claims where payment_id = payment and subject_id = original.id)
        and not exists(select 1 from public.coupon_identity_uses where coupon_id = original.coupon_id),
        'expiry_winner_release_and_late_payment_evidence');
      if fixture.n = 2 then
        perform expiry_proof.assert_true(
          (select status = 'available' and reserved_at is null from public.products where id = fixture.product)
          and (select used_count = 0 from public.coupon_definitions where id = original.coupon_id)
          and not exists(select 1 from public.inventory_reservations where product_id = fixture.product and status = 'active'),
          'late_payment_must_not_reacquire_inventory_or_coupon');
      else
        perform expiry_proof.assert_true(replacement <> original.id
          and (select status = 'pending' and coupon_reservation_state = 'reserved' from public.orders where id = replacement)
          and (select status = 'reserved' from public.products where id = fixture.product)
          and (select count(*) = 1 from public.inventory_reservations where product_id = fixture.product and status = 'active')
          and (select status = 'active' from public.inventory_reservations where order_id = replacement)
          and (select fingerprint = repeat('b', 64) and reservation_state = 'reserved' from public.coupon_checkout_reservations where order_id = replacement)
          and (select used_count = 1 from public.coupon_definitions where id = original.coupon_id)
          and not exists(select 1 from public.coupon_reservation_release_evidence where order_id = replacement),
          'old_late_approval_must_not_release_new_inventory_or_coupon_owner');
      end if;
    end if;
    perform expiry_proof.assert_true(
      exists(select 1 from public.payment_events where payment_id = payment and event_key = payment || ':approved')
      and not exists(select 1 from public.order_status_transition_authorizations)
      and not exists(select 1 from public.coupon_used_count_authorizations), 'authorization_cleanup_and_payment_event');
    raise notice 'PASS expiry concurrency case %', fixture.n;
  end loop;
  perform dblink_disconnect('expiry_a');
  perform dblink_disconnect('expiry_b');
  cleanup_deadline := clock_timestamp() + interval '5s';
  loop
    perform pg_stat_clear_snapshot();
    exit when not exists(select 1 from pg_stat_activity where pid in (a_pid, b_pid));
    if clock_timestamp() >= cleanup_deadline then raise exception 'remote_backends_not_cleaned'; end if;
    perform pg_sleep(0.01);
  end loop;
exception when others then
  perform pg_advisory_unlock_all();
  if 'expiry_a' = any(dblink_get_connections()) then perform dblink_disconnect('expiry_a'); end if;
  if 'expiry_b' = any(dblink_get_connections()) then perform dblink_disconnect('expiry_b'); end if;
  raise;
end $proof$;
select expiry_proof.assert_true(dblink_get_connections() is null, 'remote_sessions_must_disconnect');
drop trigger expiry_proof_payment_gate on public.products;
drop trigger expiry_proof_release_gate on public.orders;
drop schema expiry_proof cascade;
select '036_expire_product_reservations_concurrency_passed' as result;
