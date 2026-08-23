import "server-only";

import { revalidatePath } from "next/cache";
import { ReceiptEmail } from "@/components/emails/receipt-email";
import { getPostHogServer } from "@/lib/posthog";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface PaidOrder { customer_email: string; customer_name: string; id: string; purchase_user_id: string; total_amount: number }

export async function runNewlyAppliedProductPaymentEffects(orderId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, purchase_user_id, customer_name, customer_email, total_amount")
    .eq("id", orderId)
    .eq("integrity_version", 1)
    .eq("status", "paid")
    .maybeSingle();
  const order = data as PaidOrder | null;

  if (error || !order) return;

  try {
    if (process.env.RESEND_API_KEY && order.customer_email) {
      const { Resend } = await import("resend");
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: "ClubVTG <onboarding@resend.dev>",
        to: order.customer_email,
        subject: `Pago confirmado para la orden #${order.id.slice(0, 8)}`,
        react: ReceiptEmail({
          customerName: order.customer_name,
          orderId: order.id,
          totalAmount: order.total_amount,
        }),
      });
    }
  } catch (error: unknown) {
    console.error("[payments] receipt delivery failed:", error);
  }

  try {
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({
        distinctId: order.purchase_user_id,
        event: "product_payment_settled",
        properties: { orderId: order.id, totalAmount: order.total_amount },
      });
      await posthog.shutdown();
    }
  } catch (error: unknown) {
    console.error("[payments] analytics delivery failed:", error);
  }

  revalidatePath("/");
  revalidatePath("/orders");
}
