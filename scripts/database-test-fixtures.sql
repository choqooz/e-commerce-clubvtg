\if :{?fixture_bonus}
  insert into public.profiles (id, email, credits) values ('user_019_legacy', 'legacy@example.invalid', 9);
\endif
\if :{?fixture_anonymization}
  insert into public.profiles (id, email, credits) values ('user_021_preexisting', 'preexisting@example.invalid', 1);
  insert into public.products (id, title, slug, description, price, size, color, category, image_urls, status)
  values ('21000000-0000-0000-0000-000000000001', 'Anonymization fixture', 'anonymization-fixture', 'fixture', 1, 'M', 'black', 'fixture', '{}', 'available');
\endif
\if :{?fixture_retention}
  insert into public.profiles (id, email) values ('user_020_unmarked', 'unmarked@example.invalid');
  insert into public.orders (id, user_id, purchase_user_id, customer_email, customer_name, status, total_amount, integrity_version, payment_amount, payment_currency, payment_reference, payment_expires_at)
  values ('00000000-0000-0000-0000-000000000024', 'user_020_unmarked', 'user_020_unmarked', 'unmarked@example.invalid', 'Unmarked Person', 'paid', 1, 1, 1, 'ARS', 'order:00000000-0000-0000-0000-000000000024', '2026-01-02T03:20:00Z');
\endif
