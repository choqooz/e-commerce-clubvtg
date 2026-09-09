/* eslint-disable import/order -- Server-only dependencies must be mocked before import. */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The server action boundary is exercised with focused Vitest doubles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  captureException: vi.fn(),
  preferenceCreate: vi.fn(),
  preferenceGet: vi.fn(),
  releaseExpiredReservations: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("mercadopago", () => ({
  Preference: class {
    create = mocks.preferenceCreate;
    get = mocks.preferenceGet;
  },
}));
vi.mock("@/lib/mercadopago", () => ({ mpClient: {} }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/supabase/release-reservations", () => ({
  releaseExpiredReservations: mocks.releaseExpiredReservations,
}));
vi.mock("@/lib/urls", () => ({ resolvePaymentUrls: () => ({ siteUrl: "https://public.test", webhookBaseUrl: "https://webhook.test" }) }));

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
  mocks.currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: "buyer@example.test", verification: { status: "verified" } } });
  mocks.releaseExpiredReservations.mockResolvedValue(undefined);
  mocks.preferenceCreate.mockRejectedValue(new Error("MercadoPago unavailable"));
  mocks.preferenceGet.mockRejectedValue(new Error("MercadoPago unavailable"));
  mocks.rpc.mockImplementation((name) => {
    if (name === "get_resumable_product_checkout") return Promise.resolve({ data: [], error: null });
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
    if (name === "attach_order_preference") return Promise.resolve({ data: true, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("createCheckoutPreference telemetry isolation", () => {
  it("does not create or cancel an order when the resumable checkout lookup fails", async () => {
    mocks.rpc.mockImplementation((name) => {
      if (name === "get_resumable_product_checkout") {
        return Promise.resolve({ data: null, error: { message: "lookup unavailable" } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      error: "No pudimos comprobar si tenés un pago pendiente. Intentá nuevamente en unos instantes.",
      success: false,
    });

    expect(mocks.preferenceGet).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("create_product_checkout", expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith("cancel_product_order", expect.anything());
  });

  it("resumes an owned matching checkout with MercadoPago's stored preference instead of creating a second order", async () => {
    mocks.rpc.mockImplementation((name) => {
      if (name === "get_resumable_product_checkout") {
        return Promise.resolve({ data: [{ order_id: "order_pending", preference_id: "preference_pending", reference: "order:order_pending" }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mocks.preferenceGet.mockResolvedValueOnce({ external_reference: "order:order_pending", id: "preference_pending", init_point: "https://payment.test/resume" });

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      initPoint: "https://payment.test/resume",
      resumed: true,
      sandboxInitPoint: undefined,
      success: true,
    });

    expect(mocks.preferenceGet).toHaveBeenCalledWith({ preferenceId: "preference_pending" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("create_product_checkout", expect.anything());
    expect(mocks.preferenceCreate).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("cancel_product_order", expect.anything());
  });

  it("does not create or cancel an order when provider retrieval for a resumable checkout fails", async () => {
    mocks.rpc.mockImplementation((name) => {
      if (name === "get_resumable_product_checkout") {
        return Promise.resolve({ data: [{ order_id: "order_pending", preference_id: "preference_pending", reference: "order:order_pending" }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      error: "No pudimos retomar tu pago pendiente. Intentá nuevamente en unos instantes.",
      success: false,
    });

    expect(mocks.rpc).not.toHaveBeenCalledWith("create_product_checkout", expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith("cancel_product_order", expect.anything());
  });

  it("does not create or cancel an order when provider retrieval returns a malformed preference", async () => {
    mocks.rpc.mockImplementation((name) => {
      if (name === "get_resumable_product_checkout") {
        return Promise.resolve({ data: [{ order_id: "order_pending", preference_id: "preference_pending", reference: "order:order_pending" }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mocks.preferenceGet.mockResolvedValueOnce({ external_reference: "order:order_pending", id: "unexpected_preference", init_point: "https://payment.test/resume" });

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      error: "No pudimos retomar tu pago pendiente. Intentá nuevamente en unos instantes.",
      success: false,
    });

    expect(mocks.rpc).not.toHaveBeenCalledWith("create_product_checkout", expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith("cancel_product_order", expect.anything());
  });

  it("uses application-configured webhook delivery while preserving Checkout Pro return data", async () => {
    mocks.preferenceCreate.mockResolvedValueOnce({ id: "preference_123", init_point: "https://payment.test/checkout" });

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      initPoint: "https://payment.test/checkout",
      sandboxInitPoint: undefined,
      success: true,
    });

    const preferencePayload = mocks.preferenceCreate.mock.calls[0][0].body;
    expect(preferencePayload).toMatchObject({
      back_urls: {
        failure: "https://public.test/api/mp-return?status=failure&order_id=order_123",
        pending: "https://public.test/api/mp-return?status=pending&order_id=order_123",
        success: "https://public.test/api/mp-return?status=success&order_id=order_123",
      },
      external_reference: "order:order_123",
    });
    expect(preferencePayload).not.toHaveProperty("notification_url");
  });

  it("uses database-priced promotions when no coupon was explicitly selected", async () => {
    await createCheckoutPreference(data, items);

    expect(mocks.rpc).toHaveBeenCalledWith("create_product_checkout", expect.objectContaining({
      p_coupon_code: null,
      p_identity_fingerprint: null,
      p_pricing_source: "promotions",
    }));
  });

  it("derives the coupon identity server-side for an explicit coupon selection", async () => {
    vi.stubEnv("COUPON_IDENTITY_HMAC_KEY_V1", "test-hmac-key");

    await createCheckoutPreference(data, items, { couponCode: " snap50 ", source: "coupon" });

    expect(mocks.rpc).toHaveBeenCalledWith("create_product_checkout", expect.objectContaining({
      p_coupon_code: "SNAP50",
      p_identity_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_identity_key_version: "v1",
      p_pricing_source: "coupon",
    }));
  });

  it("uses the guarded local handoff without creating a MercadoPago preference", async () => {
    vi.stubEnv("E2E_LOCAL_PAYMENT_HANDOFF", "true");
    vi.stubEnv("E2E_LOCAL_SUPABASE", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:4173");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

    await expect(createCheckoutPreference(data, items)).resolves.toEqual({
      initPoint: "http://localhost:4173/e2e/payment-handoff?order_id=order_123",
      success: true,
    });
    expect(mocks.preferenceCreate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("attach_order_preference", expect.objectContaining({ p_order_id: "order_123" }));
  });

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
