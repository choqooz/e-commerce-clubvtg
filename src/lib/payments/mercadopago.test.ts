/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This isolated provider contract uses Vitest doubles for server-only dependencies.
import { describe, expect, it, vi } from "vitest";
import { PROCESS_PAYMENT_RESULT, processProductPayment } from "./mercadopago";
vi.mock("server-only", () => ({}));

const reference = "order:123e4567-e89b-12d3-a456-426614174000";

function payment(status = "approved", overrides: Record<string, unknown> = {}) {
  return { currency_id: "ARS", external_reference: reference, id: 123, payer: { id: "attacker" }, status, transaction_amount: 2500, ...overrides };
}

function dependencies(providerPayment: unknown = payment(), rpcData: unknown = [{ newly_applied: true, result: "applied" }]) {
  const provider = { get: vi.fn().mockResolvedValue(providerPayment) };
  const settlement = { rpc: vi.fn().mockResolvedValue({ data: rpcData, error: null }) };
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
      });
    },
  );

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
});
