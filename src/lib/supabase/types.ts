// ── Supabase Database Types ──
// Re-exports from the canonical types file.
// All domain types live in src/lib/types.ts to avoid drift.

export type {
  ProductStatus,
  Product,
  OrderStatus,
  OrderPricingSource,
  Order,
  OrderItem,
  CartItem,
  Profile,
  AiTryonLog,
  CreditTransaction,
  CreditPurchaseIntent,
  CreditPurchaseIntentStatus,
} from "@/lib/types";
