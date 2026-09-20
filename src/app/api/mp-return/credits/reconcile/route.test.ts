/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The route tests use compact response doubles at the network boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOwnedCreditReturnIntent: vi.fn(),
  processPaymentDetails: vi.fn(),
  runNewlyAppliedCreditPaymentEffects: vi.fn(),
  searchPaymentIdsByReference: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/first-effects", () => ({
  runNewlyAppliedCreditPaymentEffects: mocks.runNewlyAppliedCreditPaymentEffects,
}));
vi.mock("@/lib/payments/mercadopago", () => ({
  PROCESS_PAYMENT_RESULT: { ACKNOWLEDGED: "acknowledged", INVALID: "invalid", RETRY: "retry" },
  processPaymentDetails: mocks.processPaymentDetails,
  searchPaymentIdsByReference: mocks.searchPaymentIdsByReference,
}));
vi.mock("@/lib/payments/return-authority", () => ({
  getOwnedCreditReturnIntent: mocks.getOwnedCreditReturnIntent,
  isCreditIntentId: (value: string | null) => value === intentId,
}));

const intentId = "123e4567-e89b-12d3-a456-426614174000";
const reference = `credits:${intentId}`;

function request({ fields = {}, origin = "https://clubvtg.test", withOrigin = true } = {}) {
  const form = new FormData();
  form.set("intent_id", intentId);
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  const headers = new Headers();
  if (withOrigin) headers.set("origin", origin);
  return new Request("https://clubvtg.test/api/mp-return/credits/reconcile", {
    body: form,
    headers,
    method: "POST",
  });
}

function ownedIntent(status = "pending") {
  return { id: intentId, reference, status, user_id: "owner" };
}

describe("MercadoPago credit return reconciliation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://clubvtg.test";
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.getOwnedCreditReturnIntent.mockResolvedValue(ownedIntent());
  });

  afterEach(() => delete process.env.NEXT_PUBLIC_APP_URL);

  it("rejects missing locator, unauthenticated, foreign, and cross-origin requests before provider work", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await POST(request())).status).toBe(401);

    const missing = new Request("https://clubvtg.test/api/mp-return/credits/reconcile", {
      body: new FormData(),
      headers: { origin: "https://clubvtg.test" },
      method: "POST",
    });
    expect((await POST(missing)).status).toBe(400);

    const malformedForm = new FormData();
    malformedForm.set("intent_id", "forged");
    const malformed = new Request("https://clubvtg.test/api/mp-return/credits/reconcile", {
      body: malformedForm,
      headers: { origin: "https://clubvtg.test" },
      method: "POST",
    });
    expect((await POST(malformed)).status).toBe(400);

    mocks.getOwnedCreditReturnIntent.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);
    expect((await POST(request({ origin: "https://attacker.test" }))).status).toBe(403);
    expect(mocks.searchPaymentIdsByReference).not.toHaveBeenCalled();
  });

  it("ignores forged browser facts and searches only the immutable owned reference", async () => {
    mocks.searchPaymentIdsByReference.mockResolvedValue(["123", "456"]);
    mocks.processPaymentDetails.mockResolvedValue({
      result: "acknowledged",
      settlement: { kind: "credits", newlyApplied: false },
    });

    const response = await POST(
      request({
        fields: {
          amount: "1",
          currency: "USD",
          payment_id: "999",
          reference: "credits:forged",
          status: "approved",
          user_id: "attacker",
        },
      }),
    );

    expect(response.headers.get("location")).toBe("https://clubvtg.test/credits");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.searchPaymentIdsByReference).toHaveBeenCalledWith(reference);
    expect(mocks.processPaymentDetails).toHaveBeenNthCalledWith(1, "123");
    expect(mocks.processPaymentDetails).toHaveBeenNthCalledWith(2, "456");
    expect(mocks.getOwnedCreditReturnIntent).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["empty", []],
    ["unavailable or overflow", null],
  ])("fails closed for %s searches", async (_name, results) => {
    mocks.searchPaymentIdsByReference.mockResolvedValue(results);

    await expect(POST(request())).resolves.toMatchObject({ status: 303 });
    expect(mocks.processPaymentDetails).not.toHaveBeenCalled();
    expect(mocks.runNewlyAppliedCreditPaymentEffects).not.toHaveBeenCalled();
  });

  it("runs effects only for a newly applied settlement matching the owned intent", async () => {
    mocks.searchPaymentIdsByReference.mockResolvedValue(["123", "456"]);
    const matched = {
      credits: 50,
      intentId,
      kind: "credits",
      mpPaymentId: "456",
      newlyApplied: true,
      packId: "popular",
      purchaseUserId: "owner",
      totalAmount: 2500,
    };
    mocks.processPaymentDetails
      .mockResolvedValueOnce({
        result: "acknowledged",
        settlement: { ...matched, intentId: "00000000-0000-0000-0000-000000000001" },
      })
      .mockResolvedValueOnce({ result: "acknowledged", settlement: matched });

    await POST(request());

    expect(mocks.runNewlyAppliedCreditPaymentEffects).toHaveBeenCalledOnce();
    expect(mocks.runNewlyAppliedCreditPaymentEffects).toHaveBeenCalledWith(matched);
  });

  it("does no provider work for an already applied replay", async () => {
    mocks.getOwnedCreditReturnIntent.mockResolvedValue(ownedIntent("applied"));

    await expect(POST(request())).resolves.toMatchObject({ status: 303 });
    expect(mocks.searchPaymentIdsByReference).not.toHaveBeenCalled();
    expect(mocks.runNewlyAppliedCreditPaymentEffects).not.toHaveBeenCalled();
  });
});
