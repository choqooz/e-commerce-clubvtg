import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runNewlyAppliedCreditPaymentEffects,
  runNewlyAppliedProductPaymentEffects,
} from "./first-effects";

const getPostHogServer = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/posthog", () => ({ getPostHogServer }));
vi.mock("@/lib/resend", () => ({ getResendMailer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from } }));
vi.mock("@/components/emails/receipt-email", () => ({ ReceiptEmail: vi.fn() }));

const creditSettlement = {
  credits: 50,
  intentId: "123e4567-e89b-12d3-a456-426614174000",
  kind: "credits" as const,
  mpPaymentId: "123",
  newlyApplied: true as const,
  packId: "popular",
  purchaseUserId: "user_123",
  totalAmount: 2500,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("newly applied payment analytics effects", () => {
  it("retains the product settlement event contract with a canonical distinct id", async () => {
    const paidOrder = {
      customer_email: "",
      customer_name: "Buyer",
      id: "123e4567-e89b-12d3-a456-426614174000",
      purchase_user_id: "user_123",
      total_amount: 2500,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: paidOrder, error: null });
    const statusEq = vi.fn().mockReturnValue({ maybeSingle });
    const integrityEq = vi.fn().mockReturnValue({ eq: statusEq });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: integrityEq }) }) });
    const capture = vi.fn();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    getPostHogServer.mockReturnValue({ capture, shutdown });

    await runNewlyAppliedProductPaymentEffects(paidOrder.id);

    expect(capture).toHaveBeenCalledWith({
      distinctId: "user_123",
      event: "product_payment_settled",
      properties: { orderId: paidOrder.id, totalAmount: 2500 },
    });
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it.each([
    ["construction", () => { getPostHogServer.mockImplementation(() => { throw new Error("missing key"); }); }],
    ["capture", () => { getPostHogServer.mockReturnValue({ capture: vi.fn(() => { throw new Error("offline"); }), shutdown: vi.fn() }); }],
    ["shutdown", () => { getPostHogServer.mockReturnValue({ capture: vi.fn(), shutdown: vi.fn().mockRejectedValue(new Error("offline")) }); }],
  ])("does not throw when credit analytics %s fails", async (_name, arrange) => {
    arrange();

    await expect(runNewlyAppliedCreditPaymentEffects(creditSettlement)).resolves.toBeUndefined();
  });

  it("captures only authoritative credit intent and payment facts", async () => {
    const capture = vi.fn();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    getPostHogServer.mockReturnValue({ capture, shutdown });

    await runNewlyAppliedCreditPaymentEffects(creditSettlement);

    expect(capture).toHaveBeenCalledWith({
      distinctId: "user_123",
      event: "credit_payment_settled",
      properties: {
        credits: 50,
        intentId: creditSettlement.intentId,
        mpPaymentId: "123",
        packId: "popular",
        totalAmount: 2500,
      },
    });
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
