"use server";

import { createHmac } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Preference } from "mercadopago";
import { SHIPPING_FEE } from "@/lib/config";
import { mpClient } from "@/lib/mercadopago";
import { captureExceptionSafely } from "@/lib/sentry";
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

const CHECKOUT_PRICING_SOURCES = { COUPON: "coupon", PROMOTIONS: "promotions" } as const;
export type CheckoutPricingSource = (typeof CHECKOUT_PRICING_SOURCES)[keyof typeof CHECKOUT_PRICING_SOURCES];

export interface CheckoutPricingSelection {
  couponCode?: string;
  source: CheckoutPricingSource;
}

function localPaymentHandoff(orderId: string): string | null {
  if (process.env.E2E_LOCAL_PAYMENT_HANDOFF !== "true") return null;
  const localSupabase = /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (process.env.E2E_LOCAL_SUPABASE !== "true" || !localSupabase || process.env.NEXT_PUBLIC_APP_URL !== "http://localhost:4173") {
    throw new Error("Local E2E payment handoff requires the disposable 127.0.0.1 Supabase runtime.");
  }
  return `http://localhost:4173/e2e/payment-handoff?order_id=${encodeURIComponent(orderId)}`;
}

export async function createCheckoutPreference(
  data: CheckoutFormValues,
  items: CartItem[],
  selection?: CheckoutPricingSelection,
): Promise<{ initPoint?: string; sandboxInitPoint?: string; success: true } | { error: string; success: false }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Iniciá sesión para continuar con la compra." };

    const parsed = checkoutItemsSchema.safeParse(items);
    if (!parsed.success) return { success: false, error: "Datos del carrito inválidos" };

    const source = selection?.source ?? CHECKOUT_PRICING_SOURCES.PROMOTIONS;
    const code = selection?.couponCode?.trim().toUpperCase();
    if (!Object.values(CHECKOUT_PRICING_SOURCES).includes(source) || (source === CHECKOUT_PRICING_SOURCES.COUPON && !/^[A-Z0-9-]{3,64}$/.test(code ?? "")) || (source === CHECKOUT_PRICING_SOURCES.PROMOTIONS && code)) return { success: false, error: "La selección de descuento no es válida." };
    let identityKeyVersion: string | null = null;
    let identityFingerprint: string | null = null;
    if (source === CHECKOUT_PRICING_SOURCES.COUPON) {
      const user = await currentUser();
      const email = user?.primaryEmailAddress;
      const key = process.env.COUPON_IDENTITY_HMAC_KEY_V1;
      if (email?.verification?.status !== "verified" || !email.emailAddress || !key) return { success: false, error: "Se requiere una identidad verificada para usar un cupón." };
      identityKeyVersion = "v1";
      identityFingerprint = createHmac("sha256", key).update(email.emailAddress.trim().toLowerCase()).digest("hex");
    }

    await releaseExpiredReservations();
    const { data: checkoutData, error: checkoutError } = await supabaseAdmin.rpc(
      "create_product_checkout",
      {
        p_product_ids: parsed.data.map((item) => item.product.id),
        p_shipping_fee: SHIPPING_FEE,
        p_shipping_info: data,
        p_user_id: userId,
        p_pricing_source: source,
        p_coupon_code: code ?? null,
        p_identity_key_version: identityKeyVersion,
        p_identity_fingerprint: identityFingerprint,
      },
    );
    const intent = checkoutData?.[0] as ProductCheckoutIntent | undefined;
    if (checkoutError || !intent) {
      console.error("Product checkout intent error:", checkoutError?.message);
      return { success: false, error: "El checkout no está disponible temporalmente." };
    }

    try {
      const localHandoff = localPaymentHandoff(intent.order_id);
      if (localHandoff) {
        const { data: attached, error: attachError } = await supabaseAdmin.rpc("attach_order_preference", {
          p_expires_at: intent.expires_at,
          p_order_id: intent.order_id,
          p_preference_id: `e2e-local-${intent.order_id}`,
        });
        if (attachError || !attached) throw new Error("No se pudo asociar la preferencia de pago.");
        return { success: true, initPoint: localHandoff };
      }
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
    captureExceptionSafely(error);
    return { success: false, error: error instanceof Error ? error.message : "Error procesando el checkout" };
  }
}
