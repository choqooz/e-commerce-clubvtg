import "server-only";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const PRODUCT_RETURN_OUTCOME = {
  FAILURE: "failure",
  PENDING: "pending",
  SUCCESS: "success",
} as const;

export type ProductReturnOutcome = (typeof PRODUCT_RETURN_OUTCOME)[keyof typeof PRODUCT_RETURN_OUTCOME];

const ORDER_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

interface PersistedOrder { id: string; purchase_user_id: string; status: "paid" | "pending" | "cancelled" | "shipped" }

export function isOrderId(value: string | null): value is string {
  return value !== null && ORDER_ID.test(value);
}

export async function getOwnedProductReturnOutcome(orderId: string | null): Promise<ProductReturnOutcome> {
  if (!isOrderId(orderId)) return PRODUCT_RETURN_OUTCOME.PENDING;

  const { userId } = await auth();
  if (!userId) return PRODUCT_RETURN_OUTCOME.PENDING;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, purchase_user_id, status")
    .eq("id", orderId)
    .eq("purchase_user_id", userId)
    .eq("integrity_version", 1)
    .maybeSingle();
  const order = data as PersistedOrder | null;

  if (error || !order || order.purchase_user_id !== userId) return PRODUCT_RETURN_OUTCOME.PENDING;
  if (order.status === "paid" || order.status === "shipped") return PRODUCT_RETURN_OUTCOME.SUCCESS;
  return order.status === "cancelled" ? PRODUCT_RETURN_OUTCOME.FAILURE : PRODUCT_RETURN_OUTCOME.PENDING;
}
