-- Run against a disposable database built through migration 013.
-- PGOPTIONS='-c app.disposable_test=true' psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f "$PWD/supabase/tests/database/014_legacy_payment_inventory_audit.test.sql"
begin;

do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if;
end;
$assert$;

insert into public.profiles (id, email, credits) values ('user_014', 'audit@example.invalid', 0);
insert into public.products (id, title, slug, description, price, size, color, category, image_urls, status, reserved_at) values
  ('14000000-0000-0000-0000-000000000001', 'Available', 'audit-available', 'fixture', 10, 'M', 'black', 'fixture', '{}', 'available', null),
  ('14000000-0000-0000-0000-000000000002', 'Held', 'audit-held', 'fixture', 20, 'M', 'black', 'fixture', '{}', 'reserved', now());
insert into public.orders (id, user_id, customer_email, customer_name, status, total_amount, mp_payment_id) values
  ('14000000-0000-0000-0000-000000000011', 'user_014', 'a@example.invalid', 'A', 'paid', 10, 'duplicate-014'),
  ('14000000-0000-0000-0000-000000000012', 'user_014', 'b@example.invalid', 'B', 'pending', 10, 'duplicate-014'),
  ('14000000-0000-0000-0000-000000000013', null, 'guest@example.invalid', 'Guest', 'pending', 10, null);
insert into public.order_items (order_id, product_id, price) values
  ('14000000-0000-0000-0000-000000000011', '14000000-0000-0000-0000-000000000001', 10),
  ('14000000-0000-0000-0000-000000000012', '14000000-0000-0000-0000-000000000001', 10),
  ('14000000-0000-0000-0000-000000000013', null, 10);

\ir ../../migrations/014_legacy_payment_inventory_audit.sql

select pg_temp.assert_true((select count(*) from public.integrity_audit) >= 7, 'legacy_anomalies_not_snapshotted');
select pg_temp.assert_true((select count(*) from public.integrity_quarantine) >= 7, 'ambiguous_legacy_rows_not_quarantined');
select pg_temp.assert_true((select status = 'pending' from public.orders where id = '14000000-0000-0000-0000-000000000013'), 'audit_changed_pending_order');
select pg_temp.assert_true((select status = 'reserved' from public.products where id = '14000000-0000-0000-0000-000000000002'), 'audit_released_legacy_hold');

create temp table audit_count as select count(*) as value from public.integrity_audit;
\ir ../../migrations/014_legacy_payment_inventory_audit.sql
select pg_temp.assert_true((select value = (select count(*) from public.integrity_audit) from audit_count), 'audit_rerun_duplicated_evidence');
select count(*) as audit_rows, (select count(*) from public.integrity_quarantine) as quarantine_rows from public.integrity_audit;
rollback;
