"use server";

import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { Preference } from "mercadopago";
import { SHIPPING_FEE } from "@/lib/config";
import { mpClient } from "@/lib/mercadopago";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { releaseExpiredReservations } from "@/lib/supabase/release-reservations";
import type { CartItem } from "@/lib/types";
import { resolvePaymentUrls } from "@/lib/urls";
import { type CheckoutFormValues, checkoutItemsSchema } from "@/lib/validations/checkout";

interface CheckoutPreferenceItem {
  id: string;
  price: number;
  title: string;
}

interface ProductCheckoutIntent {
  expires_at: string;
  order_id: string;
  preference_items: CheckoutPreferenceItem[];
  reference: string;
}

export async function createCheckoutPreference(
  data: CheckoutFormValues,
  items: CartItem[],
): Promise<{ initPoint?: string; sandboxInitPoint?: string; success: true } | { error: string; success: false }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Iniciá sesión para continuar con la compra." };

    const parsed = checkoutItemsSchema.safeParse(items);
    if (!parsed.success) return { success: false, error: "Datos del carrito inválidos" };

    await releaseExpiredReservations();
    const { data: checkoutData, error: checkoutError } = await supabaseAdmin.rpc(
      "create_product_checkout",
      {
        p_product_ids: parsed.data.map((item) => item.product.id),
        p_shipping_fee: SHIPPING_FEE,
        p_shipping_info: data,
        p_user_id: userId,
      },
    );
    const intent = checkoutData?.[0] as ProductCheckoutIntent | undefined;
    if (checkoutError || !intent) {
      console.error("Product checkout intent error:", checkoutError?.message);
      return { success: false, error: "El checkout no está disponible temporalmente." };
    }

    try {
      const preference = new Preference(mpClient);
      const { webhookBaseUrl } = resolvePaymentUrls();
      const response = await preference.create({
        body: {
          items: [
            ...intent.preference_items.map((item) => ({
              id: item.id,
              title: item.title,
              currency_id: "ARS",
              quantity: 1,
              unit_price: Number(item.price),
            })),
            { id: "SHIPPING", title: "Envío Correo Argentino", currency_id: "ARS", quantity: 1, unit_price: Number(SHIPPING_FEE) },
          ],
          payer: { name: data.fullName.split(" ")[0], surname: data.fullName.split(" ").slice(1).join(" "), email: data.email },
          back_urls: { success: `${webhookBaseUrl}/api/mp-return?status=success&order_id=${intent.order_id}`, failure: `${webhookBaseUrl}/api/mp-return?status=failure&order_id=${intent.order_id}`, pending: `${webhookBaseUrl}/api/mp-return?status=pending&order_id=${intent.order_id}` },
          auto_return: "approved",
          binary_mode: true,
          expiration_date_from: new Date().toISOString(),
          expiration_date_to: intent.expires_at,
          expires: true,
          external_reference: intent.reference,
          notification_url: `${webhookBaseUrl}/api/webhooks/mp`,
          statement_descriptor: "CLUB VTG",
        },
      });
      if (!response.id || !response.init_point) throw new Error("MercadoPago no devolvió una preferencia válida.");
      const { data: attached, error: attachError } = await supabaseAdmin.rpc("attach_order_preference", {
        p_expires_at: intent.expires_at,
        p_order_id: intent.order_id,
        p_preference_id: response.id,
      });
      if (attachError || !attached) throw new Error("No se pudo asociar la preferencia de pago.");
      return { success: true, initPoint: response.init_point, sandboxInitPoint: response.sandbox_init_point };
    } catch (error: unknown) {
      const { error: cancellationError } = await supabaseAdmin.rpc("cancel_product_order", {
        p_order_id: intent.order_id,
        p_reason: "preference_creation_or_attachment_failed",
        p_release_reason: "preference_creation_or_attachment_failed",
      });
      if (cancellationError) console.error("Product checkout cancellation error:", cancellationError.message);
      throw error;
    }
  } catch (error: unknown) {
    console.error("Checkout action error:", error);
    Sentry.captureException(error);
    return { success: false, error: error instanceof Error ? error.message : "Error procesando el checkout" };
  }
}
