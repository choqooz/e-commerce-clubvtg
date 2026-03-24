import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { Resend } from "resend";
import { ReceiptEmail } from "@/components/emails/receipt-email";

/**
 * Verify MercadoPago webhook HMAC-SHA256 signature.
 * x-signature format: "ts=<timestamp>,v1=<hash>"
 * Signed template: "id:{data.id};request-id:{x-request-id};ts:{ts};"
 */
function verifyMPSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string
): boolean {
  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    })
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = createHmac("sha256", secret).update(manifest).digest("hex");

  return hmac === v1;
}

export async function POST(req: Request) {
  try {
    // ── Signature verification ──
    const xSignature = req.headers.get("x-signature") ?? "";
    const xRequestId = req.headers.get("x-request-id") ?? "";

    const url = new URL(req.url);
    // MP sends the topic and id either in URL params or body
    const body = await req.json().catch(() => ({}));
    
    // MP sends `data.id` or `id` depending on the notification type
    const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || body?.data?.id;
    const type = url.searchParams.get("type") || body?.type;

    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret && xSignature) {
      const dataId = String(paymentId ?? body?.data?.id ?? "");
      if (!verifyMPSignature(xSignature, xRequestId, dataId, webhookSecret)) {
        console.error("MP Webhook: Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else if (webhookSecret && !xSignature) {
      // Secret is configured but no signature header — reject
      console.error("MP Webhook: Missing x-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    if (type === "payment" && paymentId) {
      // Initialize MP
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MP_ACCESS_TOKEN || "", 
        options: { timeout: 10000 } 
      });
      const payment = new Payment(client);
      
      // Fetch the real payment data from MercadoPago using the ID
      // This prevents spoofing attacks
      const paymentData = await payment.get({ id: paymentId });
      
      if (paymentData.status === "approved") {
        const orderId = paymentData.external_reference;
        
        if (orderId) {
          // Usamos el cliente Admin porque los webhooks no tienen cookies de sesión
          // y las políticas RLS bloquearían cualquier intento de UPDATE por parte de "public"
          const supabase = supabaseAdmin;
          
          // 1. Update order status
          const { data: order, error: orderErr } = await supabase
            .from("orders")
            .update({ status: "paid", mp_payment_id: paymentId })
            .eq("id", orderId)
            .select("id, customer_email, customer_name, total_amount")
            .single();

          if (!orderErr && order) {
            // 2. Fetch order items to mark products as sold
            const { data: items } = await supabase
              .from("order_items")
              .select("product_id")
              .eq("order_id", orderId);

            if (items && items.length > 0) {
              const productIds = items.map(i => i.product_id);
              await supabase
                .from("products")
                .update({ status: "sold" })
                .in("id", productIds);
            }

            // 3. Send email receipt
            if (process.env.RESEND_API_KEY) {
              try {
                const resend = new Resend(process.env.RESEND_API_KEY);
                await resend.emails.send({
                  // En modo prueba de Resend, hay que usar onboarding@resend.dev y SOLO se puede enviar al mail registrado en tu cuenta de Resend
                  from: "ClubVTG Envios <onboarding@resend.dev>",
                  to: order.customer_email,
                  subject: "¡Tu compra en ClubVTG fue confirmada!",
                  react: ReceiptEmail({
                    customerName: order.customer_name,
                    orderId: order.id,
                    totalAmount: Number(order.total_amount)
                  }),
                });
                console.log("Receipt email sent to:", order.customer_email);
              } catch (emailErr) {
                console.error("Failed to send receipt email:", emailErr);
              }
            } else {
              console.warn("No RESEND_API_KEY found. Skipping receipt email.");
            }
          }
        }
      }
      
      // Additional states:
      // if (paymentData.status === "rejected" || paymentData.status === "cancelled") {
      //   // We might want to revert the status to 'available' if it was 'reserved'
      // }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MP Webhook Error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
