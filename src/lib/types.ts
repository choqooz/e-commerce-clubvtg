// ── Canonical Domain Types ──
// Single source of truth for all domain types.
// Field names match the Supabase DB schema (snake_case).
// Last synced with: migrations 001 + 004 + 005 + 006 + 007 + 009 + 020 + 023

// ── Product ──

export type ProductStatus = "available" | "reserved" | "sold" | "archived";

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  size: string | null;
  color: string | null;
  category: string;
  image_urls: string[];
  status: ProductStatus;
  reserved_at: string | null;
  created_at: string;
  updated_at: string;
  // Added in migration 004
  subcategory: string | null;
  brand: string | null;
  condition: string | null;
  measurements: string | null;
  product_type_id: string | null;
  product_subtype_id: string | null;
  base_price?: number;
  current_price?: number;
  promotion_ends_at?: string | null;
  promotion_percent?: number | null;
}

// ── Cart ──

export interface CartItem {
  product: Product;
  quantity: number;
}

// ── Orders (recreated in migration 005) ──

export const ORDER_STATUSES = { CANCELLED: "cancelled", PAID: "paid", PENDING: "pending", SHIPPED: "shipped" } as const;
export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];
export const ORDER_PRICING_SOURCES = { COUPON: "coupon", PROMOTIONS: "promotions" } as const;
export type OrderPricingSource = (typeof ORDER_PRICING_SOURCES)[keyof typeof ORDER_PRICING_SOURCES];
export const COUPON_RESERVATION_STATES = { CONSUMED: "consumed", EXPIRED: "expired", NONE: "none", RELEASED: "released", RESERVED: "reserved" } as const;
export type CouponReservationState = (typeof COUPON_RESERVATION_STATES)[keyof typeof COUPON_RESERVATION_STATES];
export const PAYMENT_REVERSAL_CLASSES = { CHARGED_BACK: "charged_back", REFUNDED: "refunded" } as const;
export type PaymentReversalClass = (typeof PAYMENT_REVERSAL_CLASSES)[keyof typeof PAYMENT_REVERSAL_CLASSES];

export interface PaymentReversalEvidence {
  created_at: string;
  event_class: PaymentReversalClass;
  reversal_total_cents: number;
}

export interface Order {
  id: string;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  status: OrderStatus;
  total_amount: number;
  shipping_fee: number;
  shipping_info: Record<string, unknown> | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
  clerk_anonymized_at: string | null;
  pricing_source?: OrderPricingSource | null;
  merchandise_original_cents?: number | null;
  merchandise_discount_cents?: number | null;
  merchandise_final_cents?: number | null;
  shipping_cents?: number | null;
  total_cents?: number | null;
  payment_amount_cents?: number | null;
  pricing_snapshot_at?: string | null;
  coupon_reservation_state?: CouponReservationState | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  price: number;
  original_cents?: number | null;
  discount_cents?: number | null;
  final_cents?: number | null;
  pricing_source?: OrderPricingSource | null;
}

// ── Supporting types (unchanged from migration 001) ──

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  credits: number;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

// ── AI Try-On ──

export type TryOnStatus = "processing" | "completed" | "failed";

export interface AiTryonLog {
  id: string;
  user_id: string;
  product_id: string;
  user_image_url: string;
  result_image_url: string | null;
  status: TryOnStatus;
  credits_charged: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string | null;
  amount: number;
  reason: string;
  mp_payment_id: string | null;
  created_at: string;
  clerk_anonymized_at: string | null;
}

export const CREDIT_PURCHASE_INTENT_STATUS = {
  PENDING: "pending",
  APPLIED: "applied",
  CANCELLED: "cancelled",
} as const;

export type CreditPurchaseIntentStatus =
  (typeof CREDIT_PURCHASE_INTENT_STATUS)[keyof typeof CREDIT_PURCHASE_INTENT_STATUS];

export interface CreditPurchaseIntent {
  id: string;
  user_id: string | null;
  reference: string;
  expires_at: string;
  status: CreditPurchaseIntentStatus;
  clerk_anonymized_at: string | null;
}

// SSE event types for try-on generation
export type TryOnStep =
  | "validating"
  | "uploading"
  | "processing"
  | "content_check"
  | "generating"
  | "finalizing";

export interface TryOnProgressEvent {
  type: "progress";
  step: TryOnStep;
  message: string;
}

export interface TryOnCompleteEvent {
  type: "complete";
  resultUrl: string;
  logId: string;
  creditsRemaining: number;
}

export interface TryOnErrorEvent {
  type: "error";
  message: string;
  code:
    | "insufficient_credits"
    | "rate_limited"
    | "generation_failed"
    | "invalid_image"
    | "not_verified"
    | "server_error"
    | "nsfw_content"
    | "no_person_detected"
    | "inappropriate_image"
    | "content_guard_unavailable";
}

export type TryOnSSEEvent = TryOnProgressEvent | TryOnCompleteEvent | TryOnErrorEvent;

export type CreditPackId = "basic" | "popular" | "pro";
