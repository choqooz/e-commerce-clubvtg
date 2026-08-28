"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface PromotionTarget {
  productSubtypeId?: string | null;
  productTypeId: string;
}

export interface PromotionInput {
  discountBps: number;
  endsAt: string;
  startsAt: string;
  targets: PromotionTarget[];
}

async function requirePromotionAdmin(): Promise<string | { error: string }> {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { userId } = await auth();
  return userId ?? { error: "No autenticado. Iniciá sesión para continuar." };
}

function revalidatePromotionCatalog() {
  revalidatePath("/");
  revalidatePath("/admin/products");
}

export async function createPromotion(input: PromotionInput) {
  const actor = await requirePromotionAdmin();
  if (typeof actor !== "string") return actor;
  const { data, error } = await supabaseAdmin.rpc("create_promotion", {
    p_actor: actor,
    p_discount_bps: input.discountBps,
    p_ends_at: input.endsAt,
    p_starts_at: input.startsAt,
    p_targets: input.targets.map((target) => ({
      product_subtype_id: target.productSubtypeId ?? null,
      product_type_id: target.productTypeId,
    })),
  });
  if (error) return { error: error.message };
  revalidatePromotionCatalog();
  return { data, success: true };
}

export async function endPromotionEarly(promotionId: string, reason: string) {
  const actor = await requirePromotionAdmin();
  if (typeof actor !== "string") return actor;
  const { error } = await supabaseAdmin.rpc("end_promotion_early", {
    p_actor: actor,
    p_promotion_id: promotionId,
    p_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePromotionCatalog();
  return { success: true };
}

export const deactivatePromotion = endPromotionEarly;
