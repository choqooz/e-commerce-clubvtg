"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const COUPON_LIFECYCLE_STATES = {
  ACTIVE: "active",
  DEACTIVATED: "deactivated",
  REPLACED: "replaced",
  REPLACEMENT: "replacement",
} as const;
export type CouponLifecycleState = (typeof COUPON_LIFECYCLE_STATES)[keyof typeof COUPON_LIFECYCLE_STATES];

export interface AdminCoupon {
  capacity: number;
  code: string;
  endsAt: string;
  id: string;
  startsAt: string;
  state: CouponLifecycleState;
  usedCount: number;
}

interface CouponTerms {
  capacity: number;
  code: string;
  discountBps: number | null;
  endsAt: string;
  fixedDiscountCents: number | null;
  startsAt: string;
}

function error(message: string) {
  return { error: message };
}

function utcDate(value: FormDataEntryValue | null): string | null {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${value}:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3]) || date.getUTCHours() !== Number(match[4]) || date.getUTCMinutes() !== Number(match[5])) return null;
  return date.toISOString();
}

function parseTerms(formData: FormData): CouponTerms | { error: string } {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const capacity = Number(formData.get("capacity"));
  const startsAt = utcDate(formData.get("startsAt"));
  const endsAt = utcDate(formData.get("endsAt"));
  const discountKind = formData.get("discountKind");
  const discountValue = String(formData.get("discountValue") ?? "").trim();
  if (!/^[A-Z0-9-]{3,64}$/.test(code)) return error("Ingresá un código en mayúsculas de 3 a 64 caracteres.");
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 2_147_483_647) return error("La capacidad debe ser un entero mayor o igual a 1.");
  if (!startsAt || !endsAt || startsAt >= endsAt) return error("La fecha de inicio debe ser anterior a la fecha de fin.");
  if (discountKind === "percentage" && /^\d+$/.test(discountValue)) {
    const percentage = Number(discountValue);
    if (percentage >= 1 && percentage <= 50) return { code, capacity, startsAt, endsAt, discountBps: percentage * 100, fixedDiscountCents: null };
  }
  if (discountKind === "fixed_ars") {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(discountValue);
    if (match) {
      const cents = Number(`${match[1]}${(match[2] ?? "").padEnd(2, "0")}`);
      if (Number.isSafeInteger(cents) && cents > 0) return { code, capacity, startsAt, endsAt, discountBps: null, fixedDiscountCents: cents };
    }
  }
  return error("El descuento debe ser un porcentaje entre 1 y 50, o un monto fijo positivo en ARS.");
}

async function actor(): Promise<string | { error: string }> {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { userId } = await auth();
  return userId ?? error("No se pudo identificar al administrador.");
}

function isError(value: string | { error: string }): value is { error: string } {
  return typeof value !== "string";
}

export async function createCoupon(formData: FormData) {
  const trustedActor = await actor();
  const terms = parseTerms(formData);
  if (isError(trustedActor)) return trustedActor;
  if ("error" in terms) return terms;
  const { error: rpcError } = await supabaseAdmin.rpc("create_coupon", {
    p_actor: trustedActor,
    p_capacity: terms.capacity,
    p_code: terms.code,
    p_discount_bps: terms.discountBps,
    p_ends_at: terms.endsAt,
    p_fixed_discount_cents: terms.fixedDiscountCents,
    p_starts_at: terms.startsAt,
  });
  if (rpcError) return error("No se pudo crear el cupón.");
  revalidatePath("/admin/coupons");
  return { success: true };
}

export async function replaceCoupon(couponId: string, formData: FormData) {
  const trustedActor = await actor();
  const terms = parseTerms(formData);
  const reason = String(formData.get("replacementReason") ?? "").trim();
  if (isError(trustedActor)) return trustedActor;
  if (!/^[0-9a-f-]{36}$/i.test(couponId) || !reason) return error("Ingresá el motivo del reemplazo.");
  if ("error" in terms) return terms;
  const { error: rpcError } = await supabaseAdmin.rpc("replace_coupon", {
    p_actor: trustedActor,
    p_capacity: terms.capacity,
    p_code: terms.code,
    p_coupon_id: couponId,
    p_discount_bps: terms.discountBps,
    p_ends_at: terms.endsAt,
    p_fixed_discount_cents: terms.fixedDiscountCents,
    p_reason: reason,
    p_starts_at: terms.startsAt,
  });
  if (rpcError) return error("No se pudo reemplazar el cupón.");
  revalidatePath("/admin/coupons");
  return { success: true };
}

export async function deactivateCoupon(couponId: string, formData: FormData) {
  const trustedActor = await actor();
  const reason = String(formData.get("deactivationReason") ?? "").trim();
  if (isError(trustedActor)) return trustedActor;
  if (!/^[0-9a-f-]{36}$/i.test(couponId) || !reason || reason.length > 500) return error("Ingresá un motivo de desactivación de hasta 500 caracteres.");
  const { data, error: rpcError } = await supabaseAdmin.rpc("deactivate_coupon", {
    p_actor: trustedActor,
    p_coupon_id: couponId,
    p_reason: reason,
  });
  if (rpcError || !data) return error("El cupón no está activo o no se pudo desactivar.");
  revalidatePath("/admin/coupons");
  return { success: true };
}

export async function getAdminCoupons(): Promise<{ data: AdminCoupon[] } | { error: string }> {
  const authError = await requireAdmin();
  if (authError) return authError;
  const [definitions, audits] = await Promise.all([
    supabaseAdmin.from("coupon_definitions").select("id, code, capacity, used_count, starts_at, ends_at, is_active").order("created_at", { ascending: false }),
    supabaseAdmin.from("coupon_audit_events").select("coupon_id, action"),
  ]);
  if (definitions.error || audits.error) return error("No se pudieron cargar los cupones.");
  const actions = new Map<string, string>();
  for (const audit of audits.data ?? []) {
    if (audit.action === "replaced" || !actions.has(audit.coupon_id)) actions.set(audit.coupon_id, audit.action);
  }
  return {
    data: (definitions.data ?? []).map((coupon) => ({
      capacity: coupon.capacity,
      code: coupon.code,
      endsAt: coupon.ends_at,
      id: coupon.id,
      startsAt: coupon.starts_at,
      state: coupon.is_active ? COUPON_LIFECYCLE_STATES.ACTIVE : actions.get(coupon.id) === "replaced" ? COUPON_LIFECYCLE_STATES.REPLACED : actions.get(coupon.id) === "replacement_created" ? COUPON_LIFECYCLE_STATES.REPLACEMENT : COUPON_LIFECYCLE_STATES.DEACTIVATED,
      usedCount: coupon.used_count,
    })),
  };
}
