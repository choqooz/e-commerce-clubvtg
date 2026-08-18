"use server";

import { auth } from "@clerk/nextjs/server";
import { Preference } from "mercadopago";
import { CREDIT_PACKS } from "@/lib/config";
import { mpClient } from "@/lib/mercadopago";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AiTryonLog, CreditPackId, CreditPurchaseIntent } from "@/lib/types";
import { resolvePaymentUrls } from "@/lib/urls";

// ── getUserCredits ──

export async function getUserCredits(): Promise<{ credits: number } | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  return { credits: data.credits };
}

// ── getTryOnHistory ──

export interface TryOnHistoryItem extends AiTryonLog {
  product_title: string;
  product_image: string | null;
}

const SIGNED_URL_EXPIRY = 3600; // 1 hour

async function resolveSignedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;

  // Already a full URL — return as-is
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    console.error(`Failed to sign ${bucket}/${path}:`, error?.message);
    return null;
  }

  return data.signedUrl;
}

export async function getTryOnHistory(): Promise<TryOnHistoryItem[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const { data, error } = await supabaseAdmin
    .from("ai_tryon_logs")
    .select("*, products(title, image_urls)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const items = await Promise.all(
    data.map(async (log) => {
      const product = log.products as {
        title: string;
        image_urls: string[];
      } | null;

      const [resultUrl, sourceUrl] = await Promise.all([
        resolveSignedUrl("ai-results", log.result_image_url),
        resolveSignedUrl("user-uploads", log.user_image_url),
      ]);

      return {
        ...log,
        result_image_url: resultUrl,
        user_image_url: sourceUrl,
        product_title: product?.title ?? "Producto eliminado",
        product_image: product?.image_urls?.[0] ?? null,
        products: undefined,
      } as TryOnHistoryItem;
    }),
  );

  return items;
}

// ── createCreditPackPreference ──

export async function createCreditPackPreference(
  packId: CreditPackId,
): Promise<{ url: string } | { error: string }> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { error: "No autenticado. Iniciá sesión para continuar." };
    }

    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) {
      return { error: "Pack de créditos inválido." };
    }

    const reference = `credits:${crypto.randomUUID()}`;
    const { data, error: intentError } = await supabaseAdmin.rpc("create_credit_purchase_intent", {
      p_user_id: userId,
      p_pack_id: pack.id,
      p_amount: pack.price,
      p_reference: reference,
      p_credits: pack.credits,
    });
    const intent = data?.[0] as CreditPurchaseIntent | undefined;
    if (intentError || !intent) {
      console.error("Credit purchase intent error:", intentError?.message);
      return { error: "La compra de créditos no está disponible temporalmente." };
    }

    try {
      const preference = new Preference(mpClient);
      const { webhookBaseUrl } = resolvePaymentUrls();
      const response = await preference.create({
        body: {
          items: [{ id: `credit-pack-${packId}`, title: `Pack de ${pack.credits} créditos - ClubVTG`, currency_id: "ARS", quantity: 1, unit_price: pack.price }],
          back_urls: { success: `${webhookBaseUrl}/api/mp-return?status=success&type=credits`, failure: `${webhookBaseUrl}/api/mp-return?status=failure&type=credits`, pending: `${webhookBaseUrl}/api/mp-return?status=pending&type=credits` },
          auto_return: "approved", external_reference: intent.reference, notification_url: `${webhookBaseUrl}/api/webhooks/mp`, statement_descriptor: "CLUB VTG", binary_mode: true,
          expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: intent.expires_at,
        },
      });
      if (!response.init_point || !response.id) throw new Error("MercadoPago no devolvió una preferencia de pago válida.");
      const { data: attached, error: attachError } = await supabaseAdmin.rpc("attach_credit_preference", {
        p_intent_id: intent.id, p_preference_id: response.id, p_expires_at: intent.expires_at,
      });
      if (attachError || !attached) throw new Error("No se pudo asociar la preferencia de pago.");
      return { url: response.init_point };
    } catch (error: unknown) {
      const { error: cancelError } = await supabaseAdmin.rpc("cancel_credit_purchase_intent", { p_intent_id: intent.id, p_reason: "preference_creation_or_attachment_failed" });
      if (cancelError) console.error("Credit purchase cancellation error:", cancelError.message);
      throw error;
    }
  } catch (error: unknown) {
    console.error("Credit pack preference error:", error);
    const message = error instanceof Error ? error.message : "Error creando la preferencia de pago";
    return { error: message };
  }
}
