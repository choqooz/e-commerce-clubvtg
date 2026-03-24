// ── Supabase Database Types ──
// Re-exports from the canonical types file.
// All domain types live in src/lib/types.ts to avoid drift.

export type {
  ProductStatus,
  Product,
  OrderStatus,
  Order,
  OrderItem,
  CartItem,
  Profile,
  AiTryonLog,
  CreditTransaction,
} from "@/lib/types";
