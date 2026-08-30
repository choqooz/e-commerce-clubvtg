"use server";

import { createHmac } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SHIPPING_FEE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkoutItemsSchema, type CheckoutCartItem } from "@/lib/validations/checkout";

export const COUPON_QUOTE_SOURCES = { COUPON: "coupon", PROMOTIONS: "promotions" } as const;
export type CouponQuoteSource = (typeof COUPON_QUOTE_SOURCES)[keyof typeof COUPON_QUOTE_SOURCES];

export interface CouponQuote {
  couponDiscountCents: string;
  couponPayableCents: string;
  defaultSource: CouponQuoteSource;
  merchandiseSubtotalCents: string;
  promotionDiscountCents: string;
  promotionsPayableCents: string;
  selectedSource: CouponQuoteSource;
  shippingCents: string;
  winningSource: CouponQuoteSource;
}

function cents(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function quoteFrom(value: unknown): CouponQuote | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const allowed = Object.values(COUPON_QUOTE_SOURCES);
  const centsValues = ["coupon_discount_cents", "merchandise_subtotal_cents", "promotion_discount_cents", "shipping_cents"].map((key) => cents(row[key]));
  if (centsValues.some((value) => value === null) || !allowed.includes(row.default_source as CouponQuoteSource) || !allowed.includes(row.selected_source as CouponQuoteSource) || !allowed.includes(row.winning_source as CouponQuoteSource)) return null;
  const [couponDiscountCents, merchandiseSubtotalCents, promotionDiscountCents, shippingCents] = centsValues as string[];
  const payable = (discountCents: string) => (BigInt(merchandiseSubtotalCents) - BigInt(discountCents) + BigInt(shippingCents)).toString();
  return { couponDiscountCents, couponPayableCents: payable(couponDiscountCents), merchandiseSubtotalCents, promotionDiscountCents, promotionsPayableCents: payable(promotionDiscountCents), shippingCents, defaultSource: row.default_source as CouponQuoteSource, selectedSource: row.selected_source as CouponQuoteSource, winningSource: row.winning_source as CouponQuoteSource };
}

export async function quoteCouponCheckout(items: CheckoutCartItem[], couponCode: string, selectedSource?: CouponQuoteSource): Promise<{ error: string; success: false } | { quote: CouponQuote; success: true }> {
  const parsed = checkoutItemsSchema.safeParse(items);
  const code = couponCode.trim().toUpperCase();
  if (!parsed.success || !/^[A-Z0-9-]{3,64}$/.test(code) || (selectedSource !== undefined && !Object.values(COUPON_QUOTE_SOURCES).includes(selectedSource))) return { success: false, error: "Invalid coupon quote request." };
  const { userId } = await auth();
  const user = await currentUser();
  const email = user?.primaryEmailAddress;
  const key = process.env.COUPON_IDENTITY_HMAC_KEY_V1;
  if (!userId || email?.verification?.status !== "verified" || !email.emailAddress || !key) return { success: false, error: "A verified identity is required for a coupon quote." };
  const fingerprint = createHmac("sha256", key).update(email.emailAddress.trim().toLowerCase()).digest("hex");
  const { data, error } = await supabaseAdmin.rpc("quote_coupon_checkout", { p_product_ids: parsed.data.map((item) => item.product.id), p_coupon_code: code, p_identity_key_version: "v1", p_identity_fingerprint: fingerprint, p_shipping_cents: SHIPPING_FEE * 100, p_selected_source: selectedSource ?? null });
  const quote = quoteFrom(data?.[0]);
  return error || !quote ? { success: false, error: "Coupon quote unavailable." } : { success: true, quote };
}
