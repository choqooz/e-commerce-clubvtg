-- 011_increment_credits.sql
-- Fix: Create the increment_credits function that the MP webhook calls
-- when a credit pack purchase is approved. Without this, users pay but
-- never receive their credits.
-- See: src/app/api/webhooks/mp/route.ts (supabase.rpc("increment_credits", ...))

CREATE OR REPLACE FUNCTION increment_credits(row_id text, amount int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles
  SET credits = credits + amount, updated_at = NOW()
  WHERE id = row_id;
$$;
