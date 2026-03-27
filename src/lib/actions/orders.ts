"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/types";
import { requireAdmin } from "@/lib/actions/auth";

const VALID_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "cancelled"];

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const authError = await requireAdmin();
  if (authError) return authError;

  if (!VALID_STATUSES.includes(status)) {
    return { error: "Estado inválido" };
  }

  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) return { error: error.message };

  revalidatePath("/admin/orders");
  return { success: true };
}
