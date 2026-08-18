-- Run against a fresh disposable database built through migration 013; 015 owns a transaction.
-- PGOPTIONS='-c app.disposable_test=true' psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f "$PWD/supabase/tests/database/015_payment_integrity_foundations.test.sql"
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if;
end;
$guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if;
end;
$assert$;

insert into public.profiles (id, email, credits) values ('user_015', 'foundation@example.invalid', 0);
insert into public.products (id, title, slug, description, price, size, color, category, image_urls, status, reserved_at) values
  ('15000000-0000-0000-0000-000000000001', 'Available', 'foundation-available', 'fixture', 10, 'M', 'black', 'fixture', '{}', 'available', null),
  ('15000000-0000-0000-0000-000000000002', 'Held', 'foundation-held', 'fixture', 20, 'M', 'black', 'fixture', '{}', 'reserved', now());
insert into public.orders (id, user_id, customer_email, customer_name, status, total_amount, mp_payment_id) values
  ('15000000-0000-0000-0000-000000000011', 'user_015', 'unique@example.invalid', 'Unique', 'paid', 10, 'unique-015'),
  ('15000000-0000-0000-0000-000000000012', 'user_015', 'dup-a@example.invalid', 'Dup A', 'paid', 10, 'duplicate-015'),
  ('15000000-0000-0000-0000-000000000013', 'user_015', 'dup-b@example.invalid', 'Dup B', 'paid', 10, 'duplicate-015'),
  ('15000000-0000-0000-0000-000000000014', null, 'pending@example.invalid', 'Pending', 'pending', 10, null),
  ('15000000-0000-0000-0000-000000000015', null, 'paid@example.invalid', 'Paid guest', 'paid', 10, null);

\ir ../../migrations/014_legacy_payment_inventory_audit.sql
\ir ../../migrations/015_payment_integrity_foundations.sql

select pg_temp.assert_true((select status = 'cancelled' from public.orders where id = '15000000-0000-0000-0000-000000000014'), 'legacy_pending_not_cancelled');
select pg_temp.assert_true((select status = 'paid' from public.orders where id = '15000000-0000-0000-0000-000000000015'), 'paid_guest_history_changed');
select pg_temp.assert_true((select status = 'available' and reserved_at is null from public.products where id = '15000000-0000-0000-0000-000000000002'), 'anonymous_hold_not_released');
select pg_temp.assert_true(exists (select 1 from public.payment_claims where payment_id = 'unique-015' and claim_state = 'active'), 'unique_payment_not_claimed');
select pg_temp.assert_true(exists (select 1 from public.payment_claims where payment_id = 'duplicate-015' and claim_state = 'blocked' and subject_id is null), 'duplicate_payment_not_blocked');
select pg_temp.assert_true(exists (select 1 from public.integrity_quarantine where source_table = 'payment_claims' and source_id = 'mercadopago:duplicate-015'), 'duplicate_claim_not_quarantined');

insert into public.orders (id, user_id, customer_email, customer_name, status, total_amount, integrity_version, purchase_user_id, payment_amount, payment_currency, payment_reference, payment_expires_at)
values ('15000000-0000-0000-0000-000000000016', 'user_015', 'new@example.invalid', 'New', 'pending', 10, 1, 'user_015', 10, 'ARS', 'new-015', now());
do $invalid$
begin
  begin
    insert into public.orders (id, user_id, customer_email, customer_name, status, total_amount, integrity_version, purchase_user_id, payment_amount, payment_currency, payment_reference, payment_expires_at)
    values ('15000000-0000-0000-0000-000000000017', 'user_015', 'bad@example.invalid', 'Bad', 'pending', 10, 1, 'other_user', 10, 'ARS', 'bad-015', now());
    raise exception 'invalid_identity_constraint_admitted';
  exception when check_violation then null;
  end;
end;
$invalid$;
create temp table claim_count as select count(*) as value from public.payment_claims;
\ir ../../migrations/015_payment_integrity_foundations.sql
select pg_temp.assert_true((select value = (select count(*) from public.payment_claims) from claim_count), 'foundation_rerun_duplicated_claims');
select count(*) as claims, (select count(*) from public.integrity_quarantine) as quarantine_rows from public.payment_claims;
