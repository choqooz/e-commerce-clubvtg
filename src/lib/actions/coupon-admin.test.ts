/* eslint-disable import/order -- Server action dependencies must be mocked before import. */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
import { createCoupon, deactivateCoupon, getAdminCoupons, replaceCoupon } from "./coupon-admin";

const id = "00000000-0000-4000-8000-000000000001";
function terms() { const formData = new FormData(); for (const [key, value] of Object.entries({ capacity: "3", code: "SAVE20", discountKind: "percentage", discountValue: "20", endsAt: "2026-09-02T00:00", startsAt: "2026-09-01T00:00" })) formData.set(key, value); return formData; }
afterEach(() => vi.clearAllMocks());

describe("coupon admin actions", () => {
  it("denies an unauthorised create before privileged database access", async () => {
    mocks.requireAdmin.mockResolvedValue({ error: "No tenés permisos de administrador." });
    await expect(createCoupon(terms())).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("validates capacity, schedules, and capped percentage discounts", async () => {
    mocks.requireAdmin.mockResolvedValue(null); mocks.auth.mockResolvedValue({ userId: "user_admin" });
    const invalid = terms(); invalid.set("capacity", "0"); invalid.set("endsAt", "2026-08-31T00:00"); invalid.set("discountValue", "51");
    await expect(createCoupon(invalid)).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects impossible normalized calendar dates before an RPC", async () => {
    mocks.requireAdmin.mockResolvedValue(null); mocks.auth.mockResolvedValue({ userId: "user_admin" });
    const invalid = terms(); invalid.set("endsAt", "2026-02-30T10:00");
    await expect(createCoupon(invalid)).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses a trusted actor for create and explicit replacement RPCs", async () => {
    mocks.requireAdmin.mockResolvedValue(null); mocks.auth.mockResolvedValue({ userId: "user_admin" }); mocks.rpc.mockResolvedValue({ error: null });
    await expect(createCoupon(terms())).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("create_coupon", expect.objectContaining({ p_actor: "user_admin", p_discount_bps: 2000, p_fixed_discount_cents: null }));
    const replacement = terms(); replacement.set("replacementReason", "Código comprometido");
    await expect(replaceCoupon(id, replacement)).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenLastCalledWith("replace_coupon", expect.objectContaining({ p_coupon_id: id, p_reason: "Código comprometido" }));
  });

  it("wires deactivation through the narrow lifecycle RPC without direct table mutation", async () => {
    mocks.requireAdmin.mockResolvedValue(null); mocks.auth.mockResolvedValue({ userId: "user_admin" });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const formData = new FormData(); formData.set("deactivationReason", "Campaña finalizada");
    await expect(deactivateCoupon(id, formData)).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("deactivate_coupon", { p_actor: "user_admin", p_coupon_id: id, p_reason: "Campaña finalizada" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns an error when deactivation is already inactive", async () => {
    mocks.requireAdmin.mockResolvedValue(null); mocks.auth.mockResolvedValue({ userId: "user_admin" }); mocks.rpc.mockResolvedValue({ data: false, error: null });
    const formData = new FormData(); formData.set("deactivationReason", "Campaña finalizada");
    await expect(deactivateCoupon(id, formData)).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("projects lifecycle DTOs without identity or audit actor fields", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const definitions = { data: [{ capacity: 3, code: "SAVE20", ends_at: "2026-09-02T00:00:00Z", id, is_active: false, starts_at: "2026-09-01T00:00:00Z", used_count: 1 }], error: null };
    const audits = { data: [{ action: "replaced", coupon_id: id }, { action: "created", coupon_id: id, fingerprint: "must-not-leak" }, { action: "deactivated", coupon_id: id }], error: null };
    mocks.from.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue(definitions) }) }).mockReturnValueOnce({ select: vi.fn().mockResolvedValue(audits) });
    await expect(getAdminCoupons()).resolves.toEqual({ data: [{ capacity: 3, code: "SAVE20", endsAt: "2026-09-02T00:00:00Z", id, startsAt: "2026-09-01T00:00:00Z", state: "replaced", usedCount: 1 }] });
    expect(mocks.from).toHaveBeenCalledWith("coupon_definitions");
  });
});
