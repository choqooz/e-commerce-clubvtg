/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This isolated provider contract uses Vitest doubles for server-only dependencies.
import { describe, expect, it, vi } from "vitest";
import { PROCESS_PAYMENT_RESULT, processPaymentDetails, processProductPayment } from "./mercadopago";
vi.mock("server-only", () => ({}));

const reference = "order:123e4567-e89b-12d3-a456-426614174000";
const creditReference = "credits:123e4567-e89b-12d3-a456-426614174000";
const creditIntent = { amount: 2500, credits: 50, currency: "ARS", id: "123e4567-e89b-12d3-a456-426614174000", pack_id: "popular", user_id: "user_123" };

function payment(status = "approved", overrides: Record<string, unknown> = {}) {
  return { currency_id: "ARS", external_reference: reference, id: 123, payer: { id: "attacker" }, status, transaction_amount: 2500, transaction_amount_refunded: status === "refunded" ? 2500 : undefined, ...overrides };
}

function dependencies(providerPayment: unknown = payment(), rpcData: unknown = [{ newly_applied: true, result: "applied" }]) {
  const provider = { get: vi.fn().mockResolvedValue(providerPayment) };
  const settlement = { rpc: vi.fn().mockResolvedValue({ data: rpcData, error: null }) };
  return { provider, settlement };
}

function creditDependencies(
  providerPayment: unknown = payment("approved", { additional_info: { items: [{ id: "credit-pack-popular", quantity: 1 }] }, external_reference: creditReference }),
  intent: unknown = creditIntent,
  rpcData: unknown = [{ intent_id: creditIntent.id, newly_applied: true, result: "applied" }],
) {
  const provider = { get: vi.fn().mockResolvedValue(providerPayment) };
  const maybeSingle = vi.fn().mockResolvedValue({ data: intent, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const settlement = { from, rpc: vi.fn().mockResolvedValue({ data: rpcData, error: null }) };
  return { provider, settlement };
}

describe("MercadoPago product payment contract", () => {
  it.each(["approved", "pending", "rejected", "cancelled", "refunded", "charged_back"])(
    "maps fetched %s facts once without trusting payer or webhook values",
    async (status) => {
      const deps = dependencies(payment(status));

      expect(await processProductPayment("123", deps)).toBe(PROCESS_PAYMENT_RESULT.ACKNOWLEDGED);
      expect(deps.provider.get).toHaveBeenCalledOnce();
      expect(deps.provider.get).toHaveBeenCalledWith({ id: "123" });
      expect(deps.settlement.rpc).toHaveBeenCalledWith("settle_product_payment", {
        p_amount: 2500, p_currency: "ARS", p_event_class: status, p_payment_id: "123", p_provider: "mercadopago", p_reference: reference,
        p_reversal_total: status === "charged_back" || status === "refunded" ? 2500 : null,
      });
    },
  );

  it("persists fetched refund totals without trusting webhook payloads", async () => {
    const deps = dependencies(payment("refunded", { transaction_amount_refunded: 750 }));

    await expect(processProductPayment("123", deps)).resolves.toBe(PROCESS_PAYMENT_RESULT.ACKNOWLEDGED);
    expect(deps.settlement.rpc).toHaveBeenCalledWith("settle_product_payment", expect.objectContaining({
      p_event_class: "refunded",
      p_reversal_total: 750,
    }));
  });

  it("accepts exact two-decimal provider amounts", async () => expect(await processProductPayment("123", dependencies(payment("approved", { transaction_amount: 120.01 })))).toBe(PROCESS_PAYMENT_RESULT.ACKNOWLEDGED));

  it("performs exactly one provider fetch and one settlement RPC per processing call", async () => {
    const deps = dependencies();

    expect(await processProductPayment("123", deps)).toBe(PROCESS_PAYMENT_RESULT.ACKNOWLEDGED);
    expect(deps.provider.get).toHaveBeenCalledOnce();
    expect(deps.provider.get).toHaveBeenCalledWith({ id: "123" });
    expect(deps.settlement.rpc).toHaveBeenCalledOnce();
  });

  it("acknowledges a deterministic duplicate without an extra mutation", async () => {
    const deps = dependencies(payment(), [{ newly_applied: false, result: "duplicate_event" }]);

    expect(await processProductPayment("123", deps)).toBe(PROCESS_PAYMENT_RESULT.ACKNOWLEDGED);
    expect(deps.provider.get).toHaveBeenCalledOnce();
    expect(deps.settlement.rpc).toHaveBeenCalledOnce();
  });

  it.each([
    [{}, PROCESS_PAYMENT_RESULT.INVALID],
    [payment("in_process"), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("approved", { external_reference: "credits:forged" }), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("approved", { id: 999 }), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("approved", { transaction_amount: Infinity }), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("approved", { transaction_amount: 1_000_000_000_001 }), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("approved", { transaction_amount: 120.006 }), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("refunded", { transaction_amount_refunded: 0 }), PROCESS_PAYMENT_RESULT.INVALID],
    [payment("refunded", { transaction_amount: 120.01, transaction_amount_refunded: 120.004 }), PROCESS_PAYMENT_RESULT.INVALID],
  ])("rejects invalid fetched facts without an RPC mutation", async (providerPayment, expected) => {
    const deps = dependencies(providerPayment);
    expect(await processProductPayment("123", deps)).toBe(expected);
    expect(deps.settlement.rpc).not.toHaveBeenCalled();
  });

  it.each(["applied", "duplicate_event", "pending_ignored", "manual_review_required", "payment_mismatch", "late_approval_manual_review"])(
    "acknowledges deterministic RPC result %s",
    async (result) => {
      expect(await processProductPayment("123", dependencies(payment(), [{ newly_applied: false, result }]))).toBe(PROCESS_PAYMENT_RESULT.ACKNOWLEDGED);
    },
  );

  it.each([
    ["provider failure", () => { const deps = dependencies(); deps.provider.get.mockRejectedValueOnce(new Error("network")); return deps; }],
    ["database failure", () => { const deps = dependencies(); deps.settlement.rpc.mockResolvedValueOnce({ data: null, error: new Error("db") }); return deps; }],
    ["thrown database failure", () => { const deps = dependencies(); deps.settlement.rpc.mockRejectedValueOnce(new Error("db")); return deps; }],
    ["malformed RPC response", () => dependencies(payment(), [{ newly_applied: "yes", result: "applied" }])],
    ["unknown RPC result", () => dependencies(payment(), [{ newly_applied: false, result: "unexpected" }])],
  ])("keeps %s retryable", async (_name, makeDependencies) => {
    expect(await processProductPayment("123", makeDependencies())).toBe(PROCESS_PAYMENT_RESULT.RETRY);
  });

  it.each([
    ["provider fetch", () => { const deps = dependencies(); deps.provider.get.mockRejectedValueOnce(new Error("network")); return deps; }, "provider_fetch"],
    ["product settlement", () => { const deps = dependencies(); deps.settlement.rpc.mockResolvedValueOnce({ data: null, error: new Error("db") }); return deps; }, "product_settlement"],
  ])("returns a typed issue for %s retries", async (_name, makeDependencies, issue) => {
    await expect(processPaymentDetails("123", makeDependencies())).resolves.toMatchObject({
      issue,
      result: PROCESS_PAYMENT_RESULT.RETRY,
      settlement: null,
    });
  });
});

describe("MercadoPago credit payment contract", () => {
  it("settles verified credit facts once through the immutable intent RPC", async () => {
    const deps = creditDependencies();

    await expect(processPaymentDetails("123", deps)).resolves.toEqual({
      result: PROCESS_PAYMENT_RESULT.ACKNOWLEDGED,
      settlement: {
        credits: 50,
        intentId: creditIntent.id,
        kind: "credits",
        mpPaymentId: "123",
        newlyApplied: true,
        packId: "popular",
        purchaseUserId: "user_123",
        totalAmount: 2500,
      },
    });
    expect(deps.provider.get).toHaveBeenCalledOnce();
    expect(deps.settlement.from).toHaveBeenCalledWith("credit_purchase_intents");
    expect(deps.settlement.rpc).toHaveBeenCalledTimes(1);
    expect(deps.settlement.rpc).toHaveBeenCalledWith("settle_credit_payment", {
      p_amount: 2500, p_currency: "ARS", p_payment_id: "123", p_provider: "mercadopago", p_reference: creditReference, p_user_id: "user_123",
    });
    expect(deps.settlement.from).not.toHaveBeenCalledWith("profiles");
  });

  it.each([
    ["malformed reference", payment("approved", { external_reference: "credits:forged" }), creditIntent],
    ["wrong pack item", payment("approved", { additional_info: { items: [{ id: "credit-pack-basic", quantity: 1 }] }, external_reference: creditReference }), creditIntent],
    ["wrong item quantity", payment("approved", { additional_info: { items: [{ id: "credit-pack-popular", quantity: 2 }] }, external_reference: creditReference }), creditIntent],
    ["mismatched amount", payment("approved", { external_reference: creditReference, transaction_amount: 100 }), creditIntent],
    ["wrong currency", payment("approved", { currency_id: "USD", external_reference: creditReference }), creditIntent],
    ["unknown user", payment("approved", { external_reference: creditReference }), { ...creditIntent, user_id: null }, PROCESS_PAYMENT_RESULT.ACKNOWLEDGED],
    ["unknown intent", payment("approved", { external_reference: creditReference }), null, PROCESS_PAYMENT_RESULT.ACKNOWLEDGED],
    ["unsupported status", payment("in_process", { external_reference: creditReference }), creditIntent],
  ])("handles %s without a credit mutation", async (_name, providerPayment, intent, expected = PROCESS_PAYMENT_RESULT.INVALID) => {
    const deps = creditDependencies(providerPayment, intent);
    await expect(processPaymentDetails("123", deps)).resolves.toMatchObject({ result: expected });
    expect(deps.settlement.rpc).not.toHaveBeenCalled();
    expect(deps.settlement.from).not.toHaveBeenCalledWith("profiles");
  });

  it.each([
    ["duplicate", [{ intent_id: creditIntent.id, newly_applied: false, result: "duplicate_payment" }], PROCESS_PAYMENT_RESULT.ACKNOWLEDGED],
    ["RPC transport failure", new Error("db"), PROCESS_PAYMENT_RESULT.RETRY],
    ["malformed RPC result", [{ intent_id: creditIntent.id, newly_applied: "yes", result: "applied" }], PROCESS_PAYMENT_RESULT.RETRY],
  ])("handles %s deterministically", async (_name, response, expected) => {
    const deps = creditDependencies();
    if (response instanceof Error) deps.settlement.rpc.mockRejectedValueOnce(response);
    else deps.settlement.rpc.mockResolvedValueOnce({ data: response, error: null });
    await expect(processPaymentDetails("123", deps)).resolves.toMatchObject({ result: expected });
    expect(deps.settlement.rpc).toHaveBeenCalledOnce();
  });

  it("returns a typed issue when the credit settlement is unavailable", async () => {
    const deps = creditDependencies();
    deps.settlement.rpc.mockResolvedValueOnce({ data: null, error: new Error("db") });

    await expect(processPaymentDetails("123", deps)).resolves.toMatchObject({
      issue: "credit_settlement",
      result: PROCESS_PAYMENT_RESULT.RETRY,
      settlement: null,
    });
  });
});
