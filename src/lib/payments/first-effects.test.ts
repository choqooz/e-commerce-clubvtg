import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runNewlyAppliedCreditPaymentEffects,
  runNewlyAppliedProductPaymentEffects,
} from "./first-effects";

const getPostHogServer = vi.hoisted(() => vi.fn());
const getResendMailer = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/posthog", () => ({ getPostHogServer }));
vi.mock("@/lib/resend", () => ({ getResendMailer }));
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("newly applied product payment receipt effects", () => {
  const paidOrder = {
    customer_email: "private-recipient@example.test",
    customer_name: "PRIVATE_CUSTOMER_NAME",
    id: "123e4567-e89b-12d3-a456-426614174000",
    purchase_user_id: "user_123",
    total_amount: 2500,
  };

  function arrangePaidOrder(customerEmail = paidOrder.customer_email) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { ...paidOrder, customer_email: customerEmail },
      error: null,
    });
    const statusEq = vi.fn().mockReturnValue({ maybeSingle });
    const integrityEq = vi.fn().mockReturnValue({ eq: statusEq });
    const idEq = vi.fn().mockReturnValue({ eq: integrityEq });
    const select = vi.fn().mockReturnValue({ eq: idEq });
    from.mockReturnValue({ select });
    return { maybeSingle, select, idEq, integrityEq, statusEq };
  }

  function arrangeAnalytics() {
    const capture = vi.fn();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    getPostHogServer.mockReturnValue({ capture, shutdown });
    return () => {
      expect(capture).toHaveBeenCalledOnce();
      expect(capture).toHaveBeenCalledWith({
        distinctId: paidOrder.purchase_user_id,
        event: "product_payment_settled",
        properties: { orderId: paidOrder.id, totalAmount: paidOrder.total_amount },
      });
      expect(shutdown).toHaveBeenCalledOnce();
      expect(revalidatePath.mock.calls).toEqual([["/"], ["/orders"]]);
    };
  }

  it("reports resolved receipt errors without leaking private data", async () => {
    const query = arrangePaidOrder();
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "PRIVATE_PROVIDER_MESSAGE",
        payload: { token: "PRIVATE_TOKEN", recipient: paidOrder.customer_email },
      },
    });
    getResendMailer.mockReturnValue({
      client: { emails: { send } },
      from: "onboarding@resend.dev",
    });
    const expectContinuation = arrangeAnalytics();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runNewlyAppliedProductPaymentEffects(paidOrder.id)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith("orders");
    expect(query.select).toHaveBeenCalledWith(
      "id, purchase_user_id, customer_name, customer_email, total_amount",
    );
    expect(query.idEq).toHaveBeenCalledWith("id", paidOrder.id);
    expect(query.integrityEq).toHaveBeenCalledWith("integrity_version", 1);
    expect(query.statusEq).toHaveBeenCalledWith("status", "paid");
    expect(getResendMailer).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "onboarding@resend.dev",
        to: paidOrder.customer_email,
      }),
    );
    expectContinuation();
    expect(diagnostic.mock.calls).toEqual([["[payments] receipt delivery failed"]]);
    const logged = JSON.stringify(diagnostic.mock.calls);
    for (const privateValue of [
      "PRIVATE_PROVIDER_MESSAGE",
      "PRIVATE_TOKEN",
      "PRIVATE_CUSTOMER_NAME",
      paidOrder.customer_email,
    ]) {
      expect(logged).not.toContain(privateValue);
    }
  });

  it("sends an eligible receipt successfully without a failure diagnostic", async () => {
    arrangePaidOrder();
    const send = vi.fn().mockResolvedValue({ data: { id: "email_123" }, error: null });
    getResendMailer.mockReturnValue({
      client: { emails: { send } },
      from: "onboarding@resend.dev",
    });
    const expectContinuation = arrangeAnalytics();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runNewlyAppliedProductPaymentEffects(paidOrder.id)).resolves.toBeUndefined();

    expect(getResendMailer).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "onboarding@resend.dev",
        to: paidOrder.customer_email,
      }),
    );
    expect(diagnostic).not.toHaveBeenCalled();
    expectContinuation();
  });

  it.each(["configuration", "delivery"])(
    "isolates thrown %s failures without logging private details",
    async (failure) => {
      arrangePaidOrder();
      const privateMessage = `PRIVATE_THROWN_MESSAGE PRIVATE_TOKEN ${paidOrder.customer_email}`;
      const send = vi.fn().mockRejectedValue(new Error(privateMessage));
      if (failure === "configuration") {
        getResendMailer.mockImplementationOnce(() => {
          throw new Error(privateMessage);
        });
      } else {
        getResendMailer.mockReturnValue({
          client: { emails: { send } },
          from: "onboarding@resend.dev",
        });
      }
      const expectContinuation = arrangeAnalytics();
      const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(runNewlyAppliedProductPaymentEffects(paidOrder.id)).resolves.toBeUndefined();

      expect(getResendMailer).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledTimes(failure === "configuration" ? 0 : 1);
      expect(diagnostic.mock.calls).toEqual([["[payments] receipt delivery failed"]]);
      const logged = JSON.stringify(diagnostic.mock.calls);
      for (const privateValue of [
        "PRIVATE_THROWN_MESSAGE",
        "PRIVATE_TOKEN",
        paidOrder.customer_email,
      ]) {
        expect(logged).not.toContain(privateValue);
      }
      expectContinuation();
    },
  );

  it("skips receipt delivery when the paid order has no customer email", async () => {
    arrangePaidOrder("");
    const send = vi.fn();
    getResendMailer.mockReturnValue({
      client: { emails: { send } },
      from: "onboarding@resend.dev",
    });
    const expectContinuation = arrangeAnalytics();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runNewlyAppliedProductPaymentEffects(paidOrder.id)).resolves.toBeUndefined();

    expect(getResendMailer).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
    expectContinuation();
  });

  it("does nothing when no eligible paid order is found", async () => {
    const { maybeSingle } = arrangePaidOrder();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const send = vi.fn();
    getResendMailer.mockReturnValue({
      client: { emails: { send } },
      from: "onboarding@resend.dev",
    });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runNewlyAppliedProductPaymentEffects(paidOrder.id)).resolves.toBeUndefined();

    expect(getResendMailer).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(getPostHogServer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  });
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
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: integrityEq }) }),
    });
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
    [
      "construction",
      () => {
        getPostHogServer.mockImplementation(() => {
          throw new Error("missing key");
        });
      },
    ],
    [
      "capture",
      () => {
        getPostHogServer.mockReturnValue({
          capture: vi.fn(() => {
            throw new Error("offline");
          }),
          shutdown: vi.fn(),
        });
      },
    ],
    [
      "shutdown",
      () => {
        getPostHogServer.mockReturnValue({
          capture: vi.fn(),
          shutdown: vi.fn().mockRejectedValue(new Error("offline")),
        });
      },
    ],
  ])("keeps product settlement intact when analytics %s fails", async (_name, arrange) => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        customer_email: "",
        customer_name: "Buyer",
        id: "order_123",
        purchase_user_id: "user_123",
        total_amount: 2500,
      },
      error: null,
    });
    const statusEq = vi.fn().mockReturnValue({ maybeSingle });
    const integrityEq = vi.fn().mockReturnValue({ eq: statusEq });
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: integrityEq }) }),
    });
    arrange();

    await expect(runNewlyAppliedProductPaymentEffects("order_123")).resolves.toBeUndefined();

    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/orders");
  });

  it.each([
    [
      "construction",
      () => {
        getPostHogServer.mockImplementation(() => {
          throw new Error("missing key");
        });
      },
    ],
    [
      "capture",
      () => {
        getPostHogServer.mockReturnValue({
          capture: vi.fn(() => {
            throw new Error("offline");
          }),
          shutdown: vi.fn(),
        });
      },
    ],
    [
      "shutdown",
      () => {
        getPostHogServer.mockReturnValue({
          capture: vi.fn(),
          shutdown: vi.fn().mockRejectedValue(new Error("offline")),
        });
      },
    ],
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
