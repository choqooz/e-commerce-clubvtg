import { afterEach, describe, expect, it, vi } from "vitest";
import { shipOrder } from "./actions/orders";
import { runNewlyAppliedProductPaymentEffects } from "./payments/first-effects";
const getResendMailer = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const getPostHogServer = vi.hoisted(() => vi.fn());
const requireAdmin = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/resend", () => ({ getResendMailer }));
vi.mock("@/lib/posthog", () => ({ getPostHogServer }));
vi.mock("@/lib/actions/auth", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from } }));
vi.mock("@/components/emails/receipt-email", () => ({ ReceiptEmail: vi.fn() }));
vi.mock("@/components/emails/dispatch-email", () => ({ DispatchEmail: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("email callers", () => {
  it("keeps payment effects successful when receipt configuration fails", async () => {
    const paidOrder = {
      customer_email: "buyer@example.com",
      customer_name: "Buyer",
      id: "123e4567-e89b-12d3-a456-426614174000",
      purchase_user_id: "user_123",
      total_amount: 2500,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: paidOrder, error: null });
    const statusEq = vi.fn().mockReturnValue({ maybeSingle });
    const integrityEq = vi.fn().mockReturnValue({ eq: statusEq });
    const idEq = vi.fn().mockReturnValue({ eq: integrityEq });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: idEq }) });
    getResendMailer.mockImplementation(() => {
      throw new Error("Invalid Resend email configuration");
    });
    getPostHogServer.mockReturnValue(null);

    await expect(runNewlyAppliedProductPaymentEffects(paidOrder.id)).resolves.toBeUndefined();

    expect(getResendMailer).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/orders");
  });

  it("keeps shipment successful when dispatch delivery fails", async () => {
    const order = {
      customer_email: "buyer@example.com",
      customer_name: "Buyer",
      id: "123e4567-e89b-12d3-a456-426614174000",
      order_items: [],
    };
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: order }) }) });
    from.mockReturnValue({ select, update });
    requireAdmin.mockResolvedValue(null);
    const send = vi.fn().mockRejectedValue(new Error("delivery unavailable"));
    getResendMailer.mockReturnValue({
      client: { emails: { send } },
      from: "ClubVTG <orders@example.com>",
    });

    await expect(shipOrder(order.id, "TRACK-123")).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledOnce();
    expect(getResendMailer).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: "ClubVTG <orders@example.com>" }));
    expect(revalidatePath).toHaveBeenCalledWith("/admin/orders");
  });
});
