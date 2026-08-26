import type { Product } from "@/lib/types";

export const ANALYTICS_EVENTS = {
  CHECKOUT_STARTED: "checkout_started",
  PRODUCT_ADDED_TO_CART: "product_added_to_cart",
  PRODUCT_VIEWED: "product_viewed",
  TRYON_GENERATED: "tryon_generated",
} as const;

type ProductAnalyticsInput = Pick<Product, "category" | "id" | "price" | "slug" | "title">;

function productProperties(product: ProductAnalyticsInput) {
  return {
    productId: product.id,
    productName: product.title,
    productCategory: product.category,
    productPrice: product.price,
    productSlug: product.slug,
  };
}

export function productViewedEvent(product: ProductAnalyticsInput) {
  return { event: ANALYTICS_EVENTS.PRODUCT_VIEWED, properties: productProperties(product) };
}

export function productAddedToCartEvent(product: ProductAnalyticsInput) {
  return { event: ANALYTICS_EVENTS.PRODUCT_ADDED_TO_CART, properties: productProperties(product) };
}

export function checkoutStartedEvent(cartItemCount: number, cartTotal: number) {
  return {
    event: ANALYTICS_EVENTS.CHECKOUT_STARTED,
    properties: { cartItemCount, cartTotal },
  };
}

export function tryOnGeneratedEvent(productId: string, productSlug: string, logId: string, userId: string) {
  return {
    event: ANALYTICS_EVENTS.TRYON_GENERATED,
    properties: { productId, productSlug, logId, userId },
  };
}
