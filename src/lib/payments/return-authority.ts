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
const CREDIT_REFERENCE = /^credits:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const PRODUCT_ORDER_STATUS = {
  CANCELLED: "cancelled",
  PAID: "paid",
  PENDING: "pending",
  SHIPPED: "shipped",
} as const;

type ProductOrderStatus = (typeof PRODUCT_ORDER_STATUS)[keyof typeof PRODUCT_ORDER_STATUS];

export interface OwnedProductReturnOrder {
  id: string;
  integrity_version: number;
  payment_reference: string | null;
  purchase_user_id: string;
  status: ProductOrderStatus;
}

export interface OwnedCreditReturnIntent {
  id: string;
  reference: string;
  status: "applied" | "cancelled" | "pending";
  user_id: string;
}

export function isCreditIntentId(value: string | null): value is string {
  return value !== null && ORDER_ID.test(value);
}

export function isOrderId(value: string | null): value is string {
  return value !== null && ORDER_ID.test(value);
}

function productReturnOutcome(order: OwnedProductReturnOrder | null): ProductReturnOutcome {
  if (!order) return PRODUCT_RETURN_OUTCOME.PENDING;
  if (order.status === PRODUCT_ORDER_STATUS.PAID || order.status === PRODUCT_ORDER_STATUS.SHIPPED) return PRODUCT_RETURN_OUTCOME.SUCCESS;
  return order.status === PRODUCT_ORDER_STATUS.CANCELLED ? PRODUCT_RETURN_OUTCOME.FAILURE : PRODUCT_RETURN_OUTCOME.PENDING;
}

export async function getOwnedProductReturnOrder(orderId: string | null, userId: string): Promise<OwnedProductReturnOrder | null> {
  if (!isOrderId(orderId)) return null;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, purchase_user_id, status, payment_reference, integrity_version")
    .eq("id", orderId)
    .eq("purchase_user_id", userId)
    .eq("integrity_version", 1)
    .maybeSingle();
  const order = data as OwnedProductReturnOrder | null;

  return error || !order || order.purchase_user_id !== userId || order.integrity_version !== 1 ? null : order;
}

export async function getOwnedProductReturnOrderForCurrentUser(orderId: string | null): Promise<OwnedProductReturnOrder | null> {
  if (!isOrderId(orderId)) return null;

  const { userId } = await auth();
  return userId ? getOwnedProductReturnOrder(orderId, userId) : null;
}

export async function getOwnedProductReturnOutcome(orderId: string | null): Promise<ProductReturnOutcome> {
  return productReturnOutcome(await getOwnedProductReturnOrderForCurrentUser(orderId));
}

export function getProductReturnOutcome(order: OwnedProductReturnOrder | null): ProductReturnOutcome {
  return productReturnOutcome(order);
}

export function isAuthoritativelyPaidProductReturn(order: OwnedProductReturnOrder | null): boolean {
  return order?.integrity_version === 1 && order.status === PRODUCT_ORDER_STATUS.PAID;
}

export async function getOwnedCreditReturnIntent(intentId: string | null, userId: string): Promise<OwnedCreditReturnIntent | null> {
  if (!isCreditIntentId(intentId)) return null;

  const { data, error } = await supabaseAdmin
    .from("credit_purchase_intents")
    .select("id, user_id, reference, status")
    .eq("id", intentId)
    .eq("user_id", userId)
    .maybeSingle();
  const intent = data as OwnedCreditReturnIntent | null;

  return error || !intent || intent.id !== intentId || intent.user_id !== userId || !CREDIT_REFERENCE.test(intent.reference) || !["applied", "cancelled", "pending"].includes(intent.status) ? null : intent;
}
