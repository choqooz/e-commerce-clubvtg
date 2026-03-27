"use server";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { CREDIT_PACKS } from "@/lib/config";
import { resolvePaymentUrls } from "@/lib/urls";
import type { AiTryonLog, CreditPackId } from "@/lib/types";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
  options: { timeout: 10000 },
});

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

async function resolveSignedUrl(
  bucket: string,
  path: string | null,
): Promise<string | null> {
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
        resolveSignedUrl("user-uploads", log.source_image_url),
      ]);

      return {
        ...log,
        result_image_url: resultUrl,
        source_image_url: sourceUrl,
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
  packId: CreditPackId
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

    const preference = new Preference(client);

    // Resolve payment URLs from environment
    const { webhookBaseUrl } = resolvePaymentUrls();

    const externalReference = `credits:${userId}:${packId}:${crypto.randomUUID()}`;

    const response = await preference.create({
      body: {
        items: [
          {
            id: `credit-pack-${packId}`,
            title: `Pack de ${pack.credits} créditos - ClubVTG`,
            currency_id: "ARS",
            quantity: 1,
            unit_price: pack.price,
          },
        ],
        back_urls: {
          success: `${webhookBaseUrl}/api/mp-return?status=success&type=credits`,
          failure: `${webhookBaseUrl}/api/mp-return?status=failure&type=credits`,
          pending: `${webhookBaseUrl}/api/mp-return?status=pending&type=credits`,
        },
        auto_return: "approved",
        external_reference: externalReference,
        notification_url: `${webhookBaseUrl}/api/webhooks/mp`,
        statement_descriptor: "CLUB VTG",
      },
    });

    if (!response.init_point) {
      throw new Error("MercadoPago no devolvió una URL de pago.");
    }

    return { url: response.init_point };
  } catch (error: unknown) {
    console.error("Credit pack preference error:", error);
    const message =
      error instanceof Error ? error.message : "Error creando la preferencia de pago";
    return { error: message };
  }
}
