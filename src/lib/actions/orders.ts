"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/auth";
import { getResendMailer } from "@/lib/resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Order, OrderItem, OrderStatus, PaymentReversalEvidence } from "@/lib/types";

interface OrderHistoryProduct {
  image_urls: string[];
  slug: string;
  title: string;
}

interface OrderHistoryCoupon {
  code: string;
}

interface OrderHistoryReversalEvidence extends PaymentReversalEvidence {
  order_id: string;
}

interface OrderHistoryItem extends OrderItem {
  products: OrderHistoryProduct | null;
}

export interface OrderHistoryOrder extends Order {
  coupon_definitions: OrderHistoryCoupon[] | null;
  product_payment_reversal_evidence: PaymentReversalEvidence[];
  promotion_ids: string[];
  order_items: OrderHistoryItem[];
}

const ORDER_HISTORY_FIELDS = "id, user_id, customer_email, customer_name, status, total_amount, shipping_fee, shipping_info, tracking_number, shipped_at, created_at, updated_at, clerk_anonymized_at, pricing_source, promotion_ids, merchandise_original_cents, merchandise_discount_cents, merchandise_final_cents, shipping_cents, total_cents, payment_amount_cents, pricing_snapshot_at, coupon_reservation_state, coupon_definitions(code), order_items(id, order_id, product_id, price, original_cents, discount_cents, final_cents, pricing_source, products(title, image_urls, slug))";

async function attachReversalEvidence(orders: OrderHistoryOrder[]) {
  const { data: reversalEvidence, error: reversalError } = await supabaseAdmin.rpc("get_order_history_reversal_evidence", { p_order_ids: orders.map(({ id }) => id) });
  if (reversalError) return null;
  const evidenceByOrderId = new Map<string, PaymentReversalEvidence[]>();
  for (const evidence of reversalEvidence ?? []) {
    const { order_id, ...safeEvidence } = evidence as OrderHistoryReversalEvidence;
    evidenceByOrderId.set(order_id, [...(evidenceByOrderId.get(order_id) ?? []), safeEvidence]);
  }
  return orders.map((order) => ({ ...order, product_payment_reversal_evidence: evidenceByOrderId.get(order.id) ?? [] }));
}

// ── User-facing ──

export async function getUserOrders() {
  const { userId } = await auth();
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_HISTORY_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return null;
  return attachReversalEvidence(data as unknown as OrderHistoryOrder[]);
}

// ── Admin ──

export async function getAdminOrders() {
  const authError = await requireAdmin();
  if (authError) return null;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_HISTORY_FIELDS)
    .order("created_at", { ascending: false });
  if (error || !data) return null;

  return attachReversalEvidence(data as unknown as OrderHistoryOrder[]);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const authError = await requireAdmin();
  if (authError) return authError;
  void orderId;
  void status;
  return { error: "Direct status changes are not allowed" };
}

export async function shipOrder(orderId: string, trackingNumber: string) {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  if (!trackingNumber.trim()) return { error: "Número de tracking requerido" };

  const { data: shipped, error: updateError } = await supabaseAdmin.rpc("ship_product_order", {
    p_order_id: orderId,
    p_tracking_number: trackingNumber.trim(),
  });
  if (updateError) return { error: updateError.message };
  if (!shipped) return { error: "Order cannot be shipped from its current state" };

  // Fetch order with items for dispatch email
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*, products(title, price))")
    .eq("id", orderId)
    .single();

  if (order?.customer_email) {
    try {
      const { client, from } = getResendMailer();
      const { DispatchEmail } = await import("@/components/emails/dispatch-email");

      await client.emails.send({
        from,
        to: order.customer_email,
        subject: `Tu pedido #${orderId.slice(0, 8)} está en camino`,
        react: DispatchEmail({
          customerName: order.customer_name,
          orderId,
          trackingNumber,
          items:
            order.order_items?.map(
              (i: { products: { title: string; price: number } | null; price: number }) => ({
                title: i.products?.title || "Producto",
                price: i.price,
              }),
            ) || [],
        }),
      });
    } catch (err) {
      console.error("[orders] dispatch email failed:", err);
    }
  }

  revalidatePath("/admin/orders");
  return { success: true };
}
