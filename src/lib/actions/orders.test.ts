import { describe, expect, it, vi } from "vitest";
import { getUserOrders, shipOrder, updateOrderStatus } from "./orders";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  order: vi.fn(),
  revalidatePath: vi.fn(),
  requireAdmin: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/actions/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/resend", () => ({ getResendMailer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({ select: mocks.select })),
    rpc: mocks.rpc,
  },
}));

describe("order authority actions", () => {
  it("does not expose identity, capacity, or audit internals in customer history", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.select.mockReturnValue({ eq: vi.fn(() => ({ order: mocks.order })) });

    await expect(getUserOrders()).resolves.toEqual([]);
    const fields = mocks.select.mock.calls[0][0] as string;
    expect(fields).toContain("merchandise_original_cents");
    expect(fields).not.toContain("product_payment_reversal_evidence");
    expect(fields).not.toMatch(/fingerprint|identity_key_version|used_count|deactivation_reason|actor/);
    expect(mocks.rpc).toHaveBeenCalledWith("get_order_history_reversal_evidence", { p_order_ids: [] });
  });

  it("rejects arbitrary status changes even for an administrator", async () => {
    mocks.rpc.mockClear();
    mocks.requireAdmin.mockResolvedValue(null);

    await expect(updateOrderStatus("order_1", "paid")).resolves.toEqual({ error: "Direct status changes are not allowed" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the valid-state shipping RPC instead of a direct order update", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await expect(shipOrder("order_1", "RR123AR")).resolves.toEqual({ error: "Order cannot be shipped from its current state" });
    expect(mocks.rpc).toHaveBeenCalledWith("ship_product_order", { p_order_id: "order_1", p_tracking_number: "RR123AR" });
  });
});
