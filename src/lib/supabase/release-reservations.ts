import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Release products stuck in 'reserved' status past the TTL.
 *
 * This is a "lazy release" strategy: instead of a cron job (which requires
 * Supabase Pro / pg_cron), we run this lightweight UPDATE before every
 * product read.  The query only touches rows matching the WHERE clause,
 * so when there are no expired reservations it's essentially a no-op.
 */
export async function releaseExpiredReservations(): Promise<void> {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();

  const { error } = await supabaseAdmin
    .from("products")
    .update({ status: "available", reserved_at: null })
    .eq("status", "reserved")
    .lt("reserved_at", cutoff);

  if (error) {
    // Log but don't throw — a failed cleanup should never block the page render.
    console.error("Failed to release expired reservations:", error.message);
  }
}
