import { describe, expect, it } from "vitest";
import {
  productAddedToCartEvent,
  productViewedEvent,
  checkoutStartedEvent,
  tryOnGeneratedEvent,
} from "./analytics-events";

const product = {
  id: "product_123",
  title: "Vintage coat",
  category: "outerwear",
  price: 12500,
  slug: "vintage-coat",
};

describe("retained analytics event descriptors", () => {
  it("keeps product event names, properties, and canonical product IDs", () => {
    expect(productViewedEvent(product)).toEqual({
      event: "product_viewed",
      properties: {
        productId: "product_123",
        productName: "Vintage coat",
        productCategory: "outerwear",
        productPrice: 12500,
        productSlug: "vintage-coat",
      },
    });
    expect(productAddedToCartEvent(product)).toEqual({
      event: "product_added_to_cart",
      properties: {
        productId: "product_123",
        productName: "Vintage coat",
        productCategory: "outerwear",
        productPrice: 12500,
        productSlug: "vintage-coat",
      },
    });
  });

  it("keeps checkout and try-on payloads scoped to canonical identifiers", () => {
    expect(checkoutStartedEvent(2, 25000)).toEqual({
      event: "checkout_started",
      properties: { cartItemCount: 2, cartTotal: 25000 },
    });
    expect(tryOnGeneratedEvent("product_123", "vintage-coat", "log_123", "user_123")).toEqual({
      event: "tryon_generated",
      properties: {
        productId: "product_123",
        productSlug: "vintage-coat",
        logId: "log_123",
        userId: "user_123",
      },
    });
  });
});
