// ── Canonical Domain Types ──
// Single source of truth for all domain types.
// Field names match the Supabase DB schema (snake_case).
// Last synced with: migrations 001 + 004 + 005 + 006

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
}

// ── Cart ──

export interface CartItem {
  product: Product;
  quantity: number;
}

// ── Orders (recreated in migration 005) ──

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

export interface Order {
  id: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string;
  status: OrderStatus;
  total_amount: number;
  shipping_fee: number;
  shipping_info: Record<string, unknown> | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  price: number;
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

export interface AiTryonLog {
  id: string;
  user_id: string;
  product_id: string;
  user_image_url: string;
  result_image_url: string | null;
  status: "processing" | "success" | "failed";
  error_message: string | null;
  credits_charged: number;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  mp_payment_id: string | null;
  created_at: string;
}
