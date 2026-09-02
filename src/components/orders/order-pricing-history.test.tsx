/* eslint-disable import/order -- Client dependencies must be mocked before import. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/orders", () => ({ shipOrder: vi.fn(), updateOrderStatus: vi.fn() }));

import { OrdersTable } from "@/components/admin/orders-table";
import type { OrderHistoryOrder } from "@/lib/actions/orders";
import { formatPrice } from "@/lib/config";
import { formatHistoricalOrderTotal } from "./order-pricing-history";
import { OrdersPageContent } from "./orders-page-content";

const immutableOrderTotalCents = 850000;
const mutableOrderItemTotalCents = 990000;
const mutableCatalogPrice = 12000;

const mutableCatalogProduct = {
  image_urls: [],
  price: mutableCatalogPrice,
  slug: "precio-actual-mutado",
  title: "Precio actual mutable",
};

const order: OrderHistoryOrder = {
  clerk_anonymized_at: null,
  coupon_definitions: [{ code: "AHORRO20" }],
  created_at: "2026-08-30T12:00:00Z",
  customer_email: "cliente@example.com",
  customer_name: "Cliente",
  id: "order-12345678",
  merchandise_discount_cents: 200000,
  merchandise_final_cents: 800000,
  merchandise_original_cents: 1000000,
  mp_payment_id: null,
  mp_preference_id: null,
  order_items: [{
    discount_cents: 0,
    final_cents: mutableOrderItemTotalCents,
    id: "item-123",
    order_id: "order-12345678",
    original_cents: mutableOrderItemTotalCents,
    price: 9900,
    pricing_source: "coupon",
    product_id: "product-123",
    products: mutableCatalogProduct,
  }],
  payment_amount_cents: 850000,
  pricing_source: "coupon",
  product_payment_reversal_evidence: [{ created_at: "2026-08-31T12:00:00Z", event_class: "refunded", reversal_total_cents: 850000 }],
  promotion_ids: [],
  shipping_cents: 50000,
  shipping_fee: 500,
  shipping_info: null,
  shipped_at: null,
  status: "paid",
  total_amount: 8500,
  total_cents: immutableOrderTotalCents,
  tracking_number: null,
  updated_at: "2026-08-30T12:00:00Z",
  user_id: "user-123",
};

function getPricingHistoryFieldValue(html: string, label: "Total a pagar") {
  const pricingHistory = html.match(
    /<section(?=[^>]*data-testid="order-pricing-history")[^>]*>([\s\S]*?)<\/section>/,
  );
  if (!pricingHistory) throw new Error("Expected the authoritative pricing history section");

  const field = pricingHistory[1].match(
    /<dt[^>]*>Total a pagar<\/dt><dd[^>]*>([^<]+)<\/dd>/,
  );
  if (!field) throw new Error(`Expected the ${label} label/value pair`);

  return field[1];
}

describe("authoritative order pricing history", () => {
  it("renders the immutable, shipping-inclusive snapshot instead of conflicting order-item or catalog totals", () => {
    const customerHtml = renderToStaticMarkup(<OrdersPageContent orders={[order]} />);
    const adminHtml = renderToStaticMarkup(<OrdersTable orders={[order]} />);
    const immutableOrderTotal = formatHistoricalOrderTotal(order);
    const mutableOrderItemTotal = formatHistoricalOrderTotal({
      total_amount: order.order_items[0].price,
      total_cents: order.order_items[0].final_cents,
    });
    const mutableCatalogTotal = formatPrice(mutableCatalogPrice);
    const immutablePricingBreakdown = [
      formatPrice(10000),
      formatPrice(2000),
      formatPrice(8000),
      formatPrice(500),
      immutableOrderTotal,
    ];

    expect(immutableOrderTotal).not.toBe(mutableOrderItemTotal);
    expect(immutableOrderTotal).not.toBe(mutableCatalogTotal);

    for (const html of [customerHtml, adminHtml]) {
      expect(html).toContain("Fuente aplicada: Cupón AHORRO20");
      expect(html).toContain("Subtotal de productos");
      expect(html).toContain("Descuento");
      expect(html).toContain("Envío");
      expect(html).toContain("Monto cobrado");
      expect(html).toContain("Reintegro registrado");
      for (const value of immutablePricingBreakdown) expect(html).toContain(value);
      const payableTotal = getPricingHistoryFieldValue(html, "Total a pagar");
      expect(payableTotal).toBe(immutableOrderTotal);
      expect(payableTotal).not.toBe(mutableOrderItemTotal);
      expect(html).not.toContain(mutableCatalogTotal);
      expect(html).not.toMatch(/fingerprint|authorization|provider_payload|identity_key_version/i);
    }

    expect(customerHtml).toContain(mutableOrderItemTotal);
    expect(adminHtml).not.toContain(mutableOrderItemTotal);
  });

  it("omits pricing and reversal details when the safe DTO has no immutable snapshot", () => {
    const html = renderToStaticMarkup(<OrdersPageContent orders={[{ ...order, merchandise_original_cents: null, product_payment_reversal_evidence: [] }]} />);

    expect(html).not.toContain("Detalle de precios confirmado");
    expect(html).not.toContain("Reversiones registradas");
  });
});
