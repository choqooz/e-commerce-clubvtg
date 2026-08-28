/* eslint-disable import/order -- Server action dependencies must be mocked before import. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { quoteCouponCheckout } from "./coupon-quote";

const items = [{ product: { id: "00000000-0000-4000-8000-000000000001" }, quantity: 1 as const }];

beforeEach(() => {
  vi.stubEnv("COUPON_IDENTITY_HMAC_KEY_V1", "test-hmac-key");
  mocks.auth.mockResolvedValue({ userId: "user_123" });
  mocks.currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: " Buyer@Example.Test ", verification: { status: "verified" } } });
  mocks.rpc.mockResolvedValue({ data: [{ merchandise_subtotal_cents: "1000000", shipping_cents: "0", promotion_discount_cents: "300000", coupon_discount_cents: "500000", default_source: "promotions", selected_source: "promotions", winning_source: "coupon" }], error: null });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("quoteCouponCheckout", () => {
  it("derives a versioned HMAC from the verified canonical email and returns cents as strings", async () => {
    await expect(quoteCouponCheckout(items, " save50 ")).resolves.toMatchObject({ success: true, quote: { merchandiseSubtotalCents: "1000000", selectedSource: "promotions", winningSource: "coupon" } });
    expect(mocks.rpc).toHaveBeenCalledWith("quote_coupon_checkout", expect.objectContaining({ p_coupon_code: "SAVE50", p_identity_key_version: "v1", p_identity_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });

  it("rejects unverified identities without invoking the privileged quote RPC", async () => {
    mocks.currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: "buyer@example.test", verification: { status: "unverified" } } });
    await expect(quoteCouponCheckout(items, "SAVE50")).resolves.toMatchObject({ success: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
