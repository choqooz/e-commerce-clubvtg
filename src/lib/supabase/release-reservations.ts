import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function releaseExpiredReservations(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("expire_product_reservations", {
    p_limit: 100,
    p_now: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to release expired reservations:", error.message);
  }
}
