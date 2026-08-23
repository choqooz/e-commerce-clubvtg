/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This contract intentionally mutates request headers with malformed values.
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ processProductPaymentDetails: vi.fn(), runNewlyAppliedProductPaymentEffects: vi.fn() }));
vi.mock("../../../../lib/payments/mercadopago", () => ({
  PROCESS_PAYMENT_RESULT: { ACKNOWLEDGED: "acknowledged", INVALID: "invalid", RETRY: "retry" },
  isCandidatePaymentId: (value: string | null) => value !== null && /^[1-9]\d{0,17}$/.test(value),
  processProductPaymentDetails: mocks.processProductPaymentDetails,
}));
vi.mock("@/lib/payments/first-effects", () => ({
  runNewlyAppliedProductPaymentEffects: mocks.runNewlyAppliedProductPaymentEffects,
}));
import { POST } from "./route";

const secret = "webhook-secret";

function signedRequest({ body = { type: "payment", data: { id: "123" } }, paymentId = "123", signature = true, topic = "payment" }: { body?: unknown; paymentId?: string; signature?: boolean; topic?: string } = {}) {
  const requestId = "request-1";
  const timestamp = "1710000000";
  const manifest = `id:${paymentId};request-id:${requestId};ts:${timestamp};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");

  return new Request(`http://localhost/api/webhooks/mp?data.id=${paymentId}&type=${topic}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-request-id": requestId, "x-signature": `ts=${timestamp},v1=${signature ? digest : "bad"}` },
    method: "POST",
  });
}

describe("MercadoPago product webhook activation", () => {
  afterEach(() => { delete process.env.MP_WEBHOOK_SECRET; vi.clearAllMocks(); });

  it("gates every provider and database call behind a valid signature", async () => {
    process.env.MP_WEBHOOK_SECRET = secret;
    expect((await POST(signedRequest({ signature: false }))).status).toBe(401);
    expect(mocks.processProductPaymentDetails).not.toHaveBeenCalled();
  });

  it.each([null, "ts=1710000000,v1=bad", "ts=1710000000,v1=a"])("rejects missing, bad, and unequal-length signatures", async (signature) => {
    process.env.MP_WEBHOOK_SECRET = secret;
    const request = signedRequest();
    if (signature === null) request.headers.delete("x-signature");
    else request.headers.set("x-signature", signature);
    expect((await POST(request)).status).toBe(401);
    expect(mocks.processProductPaymentDetails).not.toHaveBeenCalled();
  });

  it("rejects a valid digest with a non-hex suffix without downstream effects", async () => {
    process.env.MP_WEBHOOK_SECRET = secret;
    const request = signedRequest();
    const signature = request.headers.get("x-signature");
    request.headers.set("x-signature", `${signature}not-hex`);

    expect((await POST(request)).status).toBe(401);
    expect(mocks.processProductPaymentDetails).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", new Request("http://localhost/api/webhooks/mp", { body: "{", method: "POST" })],
    ["invalid payment id", signedRequest({ paymentId: "not-an-id" })],
    ["unsupported topic", signedRequest({ topic: "merchant_order" })],
    ["conflicting body id", signedRequest({ body: { type: "payment", data: { id: "456" } } })],
    ["untrusted status", signedRequest({ body: { status: "approved", type: "payment", data: { id: "123" } } })],
  ])("rejects %s without side effects", async (_name, request) => {
    process.env.MP_WEBHOOK_SECRET = secret;
    expect((await POST(request)).status).toBe(400);
    expect(mocks.processProductPaymentDetails).not.toHaveBeenCalled();
  });

  it("uses only the signed candidate id without PR5 side effects", async () => {
    process.env.MP_WEBHOOK_SECRET = secret;
    mocks.processProductPaymentDetails.mockResolvedValueOnce({ result: "acknowledged", settlement: { newlyApplied: false, orderId: null } });
    const response = await POST(signedRequest({ body: { amount: 1, currency: "USD", data: { id: "123" }, external_reference: "order:forged", payer: { id: "attacker" }, type: "payment" } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(mocks.processProductPaymentDetails).toHaveBeenCalledWith("123");
    expect(mocks.runNewlyAppliedProductPaymentEffects).not.toHaveBeenCalled();
  });

  it("runs first-only effects once for a newly applied settlement and not for its replay", async () => {
    process.env.MP_WEBHOOK_SECRET = secret;
    mocks.processProductPaymentDetails
      .mockResolvedValueOnce({ result: "acknowledged", settlement: { newlyApplied: true, orderId: "123e4567-e89b-12d3-a456-426614174000" } })
      .mockResolvedValueOnce({ result: "acknowledged", settlement: { newlyApplied: false, orderId: "123e4567-e89b-12d3-a456-426614174000" } });

    expect((await POST(signedRequest())).status).toBe(200);
    expect((await POST(signedRequest())).status).toBe(200);

    expect(mocks.runNewlyAppliedProductPaymentEffects).toHaveBeenCalledTimes(1);
    expect(mocks.runNewlyAppliedProductPaymentEffects).toHaveBeenCalledWith(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });

  it("returns retryable 503 responses for provider and database failures", async () => {
    process.env.MP_WEBHOOK_SECRET = secret;
    mocks.processProductPaymentDetails.mockResolvedValueOnce({ result: "retry", settlement: null });
    const response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
