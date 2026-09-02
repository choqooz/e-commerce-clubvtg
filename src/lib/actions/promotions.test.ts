/* eslint-disable import/order -- Action dependencies must be mocked before import. */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { createPromotion, endPromotionEarly, revisePromotion } from "./promotions";

afterEach(() => vi.clearAllMocks());

describe("promotion admin actions", () => {
  it("re-authorizes before calling a privileged promotion RPC", async () => {
    mocks.requireAdmin.mockResolvedValue({ error: "No tenés permisos de administrador." });

    await expect(createPromotion({ discountBps: 1000, endsAt: "2026-09-01T00:00:00Z", startsAt: "2026-08-31T00:00:00Z", targets: [{ productTypeId: "type-id" }] })).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the trusted Clerk actor and preserves the early-end reason", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: "user_admin" });
    mocks.rpc.mockResolvedValue({ error: null });

    await expect(endPromotionEarly("promotion-id", "inventory correction")).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("end_promotion_early", {
      p_actor: "user_admin", p_promotion_id: "promotion-id", p_reason: "inventory correction",
    });
  });

  it("re-authorizes and sends a future revision through the dedicated immutable-version RPC", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: "user_admin" });
    mocks.rpc.mockResolvedValue({ data: 2, error: null });

    await expect(revisePromotion("promotion-id", {
      discountBps: 2000,
      endsAt: "2026-09-02T00:00:00Z",
      startsAt: "2026-09-01T00:00:00Z",
      targets: [{ productTypeId: "type-id" }],
    }, "Correct future campaign terms")).resolves.toEqual({ data: 2, success: true });

    expect(mocks.rpc).toHaveBeenCalledWith("revise_promotion", {
      p_actor: "user_admin",
      p_discount_bps: 2000,
      p_ends_at: "2026-09-02T00:00:00Z",
      p_promotion_id: "promotion-id",
      p_reason: "Correct future campaign terms",
      p_starts_at: "2026-09-01T00:00:00Z",
      p_targets: [{ product_subtype_id: null, product_type_id: "type-id" }],
    });
  });
});
