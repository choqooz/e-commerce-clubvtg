// ── Supabase Admin Client (Service Role) ──
// ONLY use server-side (API routes, webhooks, server actions)
// Bypasses RLS — full access to all data

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing required Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
  );
}

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false },
});
