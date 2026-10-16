-- Prepared only: applying this migration requires separate database authorization.
-- Publish active master names, including types without products. RLS filters activity;
-- clients must not select IDs, timestamps, is_active, or subtype rows to do so.
begin;

-- Remove base table access only for public client roles; retain authority-role grants.
revoke all privileges on table public.product_types from public, anon, authenticated;
grant select (name) on table public.product_types to anon, authenticated;

-- Re-running replaces only this migration's policy, not existing admin contracts.
drop policy if exists public_catalog_type_names on public.product_types;
create policy public_catalog_type_names on public.product_types
  for select to anon, authenticated
  using (is_active = true);

commit;

-- Rollback (reference only; do not execute without separate authorization):
-- begin;
-- drop policy if exists public_catalog_type_names on public.product_types;
-- revoke select (name) on table public.product_types from anon, authenticated;
-- commit;
-- No data was changed. RLS and pre-existing admin/service permissions stay intact.
