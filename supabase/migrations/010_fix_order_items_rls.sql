-- 010_fix_order_items_rls.sql
-- Fix: Remove overly permissive INSERT policy on order_items.
-- All order/item creation is done server-side via supabaseAdmin (service role),
-- so the public role should have NO write access to order_items.

-- Drop the dangerous "Anyone can insert order_items" policy from 005
DROP POLICY IF EXISTS "Anyone can insert order_items" ON public.order_items;

-- No replacement needed — all inserts go through service_role key which bypasses RLS.
-- If we ever need client-side inserts in the future, add a restrictive policy then.

NOTIFY pgrst, 'reload schema';
