/* eslint-disable @typescript-eslint/ban-ts-comment, import/order */
// @ts-nocheck -- Vitest is invoked ephemerally for this isolated safety proof.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ mercadoPago: 0, supabaseMutation: 0, email: 0, revalidate: 0 }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  Payment: class {
    async get() {
      calls.mercadoPago += 1;
      return { status: "approved", external_reference: "order-123" };
    }
  },
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: async () => (calls.email += 1) }; } }));
vi.mock("@/components/emails/receipt-email", () => ({ ReceiptEmail: vi.fn() }));
vi.mock("@/lib/config", () => ({ CREDIT_PACKS: [] }));
vi.mock("@/lib/posthog", () => ({ getPostHogServer: () => null }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      update: () => {
        calls.supabaseMutation += 1;
        return { eq: () => ({ select: () => ({ single: async () => ({ data: {} }) }) }) };
      },
    }),
  },
}));
import { POST } from "./route";

const SECRET = "test-webhook-secret";
const ID = "payment-123";
const REQUEST_ID = "request-123";
const signature = (id = ID) => {
  const timestamp = "1710000000";
  return `ts=${timestamp},v1=${createHmac("sha256", SECRET).update(`id:${id};request-id:${REQUEST_ID};ts:${timestamp};`).digest("hex")}`;
};
function request(body = { type: "payment", data: { id: ID } }, query = `?type=payment&data.id=${ID}`, signed = signature()) {
  const headers = new Headers({ "content-type": "application/json", "x-request-id": REQUEST_ID });
  if (signed !== null) headers.set("x-signature", signed);
  return new Request(`http://localhost/api/webhooks/mp${query}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

describe("MercadoPago webhook safety outage", () => {
  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    Object.assign(calls, { mercadoPago: 0, supabaseMutation: 0, email: 0, revalidate: 0 });
  });

  it("fails closed before provider or settlement side effects", async () => {
    const response = await POST(request());
    expect(calls).toEqual({ mercadoPago: 0, supabaseMutation: 0, email: 0, revalidate: 0 });
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toEqual({ error: "Product payment settlement is temporarily unavailable", retryable: true });
  });

  it.each([
    ["malformed JSON", "{", undefined, undefined, 400],
    ["missing signature", undefined, undefined, null, 401],
    ["bad signature", undefined, undefined, "ts=1710000000,v1=bad", 401],
    ["unequal signature length", undefined, undefined, "ts=1710000000,v1=a", 401],
    ["query/body conflict", { type: "payment", data: { id: "other" } }, undefined, undefined, 400],
    ["unsupported type", { type: "merchant_order", data: { id: ID } }, `?data.id=${ID}`, undefined, 400],
    ["unsupported status", { type: "payment", status: "in_process", data: { id: ID } }, undefined, undefined, 400],
  ])("rejects %s without side effects", async (_name, body, query, signed, status) => {
    expect((await POST(request(body, query, signed))).status).toBe(status);
    expect(calls).toEqual({ mercadoPago: 0, supabaseMutation: 0, email: 0, revalidate: 0 });
  });
});
