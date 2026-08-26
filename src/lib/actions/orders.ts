"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/auth";
import { getResendMailer } from "@/lib/resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/types";

// ── User-facing ──

export async function getUserOrders() {
  const { userId } = await auth();
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*, products(title, image_urls, slug))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return null;
  return data;
}

// ── Admin ──

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

export async function shipOrder(orderId: string, trackingNumber: string) {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  if (!trackingNumber.trim()) return { error: "Número de tracking requerido" };

  // Update order with tracking info
  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      status: "shipped",
      tracking_number: trackingNumber.trim(),
      shipped_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) return { error: updateError.message };

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
