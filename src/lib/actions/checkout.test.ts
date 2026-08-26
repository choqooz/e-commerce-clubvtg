/* eslint-disable import/order -- Server-only dependencies must be mocked before import. */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The server action boundary is exercised with focused Vitest doubles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  captureException: vi.fn(),
  preferenceCreate: vi.fn(),
  releaseExpiredReservations: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("mercadopago", () => ({
  Preference: class {
    create = mocks.preferenceCreate;
  },
}));
vi.mock("@/lib/mercadopago", () => ({ mpClient: {} }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/supabase/release-reservations", () => ({
  releaseExpiredReservations: mocks.releaseExpiredReservations,
}));
vi.mock("@/lib/urls", () => ({ resolvePaymentUrls: () => ({ webhookBaseUrl: "https://shop.test" }) }));

import { createCheckoutPreference } from "./checkout";

const data = {
  city: "Buenos Aires",
  dni: "12345678",
  email: "buyer@example.test",
  fullName: "Ada Lovelace",
  number: "123",
  phone: "1144445555",
  province: "Buenos Aires",
  street: "Main Street",
  zipCode: "1000",
};

const items = [{ product: { id: "00000000-0000-4000-8000-000000000001" }, quantity: 1 }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_123" });
  mocks.releaseExpiredReservations.mockResolvedValue(undefined);
  mocks.preferenceCreate.mockRejectedValue(new Error("MercadoPago unavailable"));
  mocks.rpc.mockImplementation((name) => {
    if (name === "create_product_checkout") {
      return Promise.resolve({
        data: [
          {
            expires_at: "2026-08-27T00:00:00.000Z",
            order_id: "order_123",
            preference_items: [{ id: "product_123", price: 2000, title: "Vintage coat" }],
            reference: "order:order_123",
          },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

afterEach(() => vi.restoreAllMocks());

describe("createCheckoutPreference telemetry isolation", () => {
  it("returns the existing structured failure and runs cancellation when Sentry capture throws", async () => {
    mocks.captureException.mockImplementation(() => {
      throw new Error("Sentry unavailable");
    });

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      error: "MercadoPago unavailable",
      success: false,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("cancel_product_order", {
      p_order_id: "order_123",
      p_reason: "preference_creation_or_attachment_failed",
      p_release_reason: "preference_creation_or_attachment_failed",
    });
  });
});
