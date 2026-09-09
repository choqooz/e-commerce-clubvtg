import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCreditPackPreference } from "./credits";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  preferenceCreate: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("mercadopago", () => ({
  Preference: class {
    create = mocks.preferenceCreate;
  },
}));
vi.mock("@/lib/mercadopago", () => ({ mpClient: {} }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/urls", () => ({
  resolvePaymentUrls: () => ({ siteUrl: "https://public.test", webhookBaseUrl: "https://webhook.test" }),
}));

describe("createCreditPackPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    mocks.preferenceCreate.mockResolvedValue({ id: "preference_123", init_point: "https://payment.test/checkout" });
    mocks.rpc.mockImplementation((name) => {
      if (name === "create_credit_purchase_intent") {
        return Promise.resolve({
          data: [{ expires_at: "2026-12-31T00:00:00.000Z", id: "intent_123", reference: "credits:intent_123" }],
          error: null,
        });
      }
      if (name === "attach_credit_preference") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the public origin for browser returns and the webhook origin for provider notifications", async () => {
    await expect(createCreditPackPreference("basic")).resolves.toEqual({ url: "https://payment.test/checkout" });

    const preferencePayload = mocks.preferenceCreate.mock.calls[0][0].body;
    expect(preferencePayload).toMatchObject({
      back_urls: {
        failure: "https://public.test/api/mp-return?status=failure&type=credits",
        pending: "https://public.test/api/mp-return?status=pending&type=credits",
        success: "https://public.test/api/mp-return?status=success&type=credits",
      },
      notification_url: "https://webhook.test/api/webhooks/mp",
    });
  });
});
