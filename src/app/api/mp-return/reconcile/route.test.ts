/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The route tests use compact response doubles at the network boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  processPaymentDetails: vi.fn(),
  runNewlyAppliedProductPaymentEffects: vi.fn(),
  searchProductPaymentIdsByReference: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/payments/mercadopago", () => ({
  PROCESS_PAYMENT_RESULT: { ACKNOWLEDGED: "acknowledged", INVALID: "invalid", RETRY: "retry" },
  processPaymentDetails: mocks.processPaymentDetails,
  searchProductPaymentIdsByReference: mocks.searchProductPaymentIdsByReference,
}));
vi.mock("@/lib/payments/first-effects", () => ({ runNewlyAppliedProductPaymentEffects: mocks.runNewlyAppliedProductPaymentEffects }));

const orderId = "123e4567-e89b-12d3-a456-426614174000";
const reference = `order:${orderId}`;

function request({
  fields = {},
  headers: extraHeaders = {},
  origin = "https://clubvtg.test",
  url = "https://clubvtg.test/api/mp-return/reconcile",
  withOrigin = true,
} = {}) {
  const form = new FormData();
  form.set("order_id", orderId);
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  const headers = new Headers(extraHeaders);
  if (withOrigin) headers.set("origin", origin);
  return new Request(url, { body: form, headers, method: "POST" });
}

function persistedOrder(status = "pending", paymentReference = reference) {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.maybeSingle.mockResolvedValue({
    data: { id: orderId, integrity_version: 1, payment_reference: paymentReference, purchase_user_id: "owner", status },
    error: null,
  });
  const query = { eq: vi.fn(), maybeSingle: mocks.maybeSingle, select: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
}

describe("MercadoPago return reconciliation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://clubvtg.test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("accepts the configured public Origin when the route URL is internal behind a proxy", async () => {
    persistedOrder("paid");

    const response = await POST(request({ url: "http://next.internal/api/mp-return/reconcile" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://clubvtg.test/checkout/success?order_id=${orderId}`);
    expect(mocks.searchProductPaymentIdsByReference).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["relative", "/checkout"],
    ["non-HTTP", "ftp://clubvtg.test"],
    ["missing authority delimiter", "https:/clubvtg.test"],
    ["malformed", "https://"],
  ])("fails closed for a %s configured public origin", async (_name, appUrl) => {
    persistedOrder("paid");
    if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = appUrl;

    const response = await POST(request({ url: "http://next.internal/api/mp-return/reconcile" }));

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not trust Host or forwarded headers as origin authority", async () => {
    persistedOrder("paid");

    const response = await POST(request({
      headers: {
        forwarded: "host=clubvtg.test;proto=https",
        host: "clubvtg.test",
        "x-forwarded-host": "clubvtg.test",
        "x-forwarded-proto": "https",
      },
      origin: "https://attacker.test",
      url: "http://next.internal/api/mp-return/reconcile",
    }));

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    "http://clubvtg.test",
    "https://attacker.test",
    "https://subdomain.clubvtg.test",
    "https://clubvtg.test:8443",
    "https://clubvtg.test https://attacker.test",
  ])("rejects a configured-origin mismatch for %s", async (origin) => {
    persistedOrder("paid");

    expect((await POST(request({ origin, url: "http://next.internal/api/mp-return/reconcile" }))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects configured public origins with a path, query, or fragment", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://clubvtg.test:443/checkout?return=1#payment";
    persistedOrder("paid");

    expect((await POST(request({ origin: "https://clubvtg.test/", url: "http://next.internal/api/mp-return/reconcile" }))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated, foreign, malformed, and cross-origin requests before provider work", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request())).status).toBe(401);

    persistedOrder();
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request())).status).toBe(404);

    const malformed = request();
    const malformedForm = new FormData();
    malformedForm.set("order_id", "not-a-uuid");
    const malformedRequest = new Request(malformed.url, { body: malformedForm, headers: malformed.headers, method: "POST" });
    expect((await POST(malformedRequest)).status).toBe(400);
    expect((await POST(request({ withOrigin: false }))).status).toBe(403);
    expect((await POST(request({ origin: "https://attacker.test" }))).status).toBe(403);
    expect(mocks.searchProductPaymentIdsByReference).not.toHaveBeenCalled();
  });

  it("ignores forged browser facts and searches only the immutable owned reference", async () => {
    persistedOrder();
    mocks.searchProductPaymentIdsByReference.mockResolvedValue(["123"]);
    mocks.processPaymentDetails.mockResolvedValue({ result: "acknowledged", settlement: { kind: "product", newlyApplied: false, orderId } });

    const response = await POST(request({ fields: { external_reference: "order:forged", payment_id: "999", status: "approved" } }));

    expect(response.status).toBe(303);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.searchProductPaymentIdsByReference).toHaveBeenCalledWith(reference);
    expect(mocks.processPaymentDetails).toHaveBeenCalledWith("123");
  });

  it.each([
    ["paid", `/checkout/success?order_id=${orderId}`],
    ["cancelled", "/checkout/failure"],
  ])("short-circuits terminal %s orders without a provider search", async (status, path) => {
    persistedOrder(status);

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://clubvtg.test${path}`);
    expect(mocks.searchProductPaymentIdsByReference).not.toHaveBeenCalled();
  });

  it("issues a short-lived cart-clear proof only after authoritative paid reconciliation", async () => {
    persistedOrder("paid");

    const response = await POST(request());

    expect(response.headers.get("location")).toBe(`https://clubvtg.test/checkout/success?order_id=${orderId}`);
    expect(response.headers.get("set-cookie")).toContain(`clubvtg-cart-clear-order=${orderId}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Path=/api/mp-return/cart-clear-proof/consume");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("does not issue a cart-clear proof for shipped orders", async () => {
    persistedOrder("shipped");

    const response = await POST(request());

    expect(response.headers.get("location")).toBe(`https://clubvtg.test/checkout/success?order_id=${orderId}`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["empty search", []],
    ["provider failure", null],
  ])("re-reads and leaves %s pending without effects", async (_name, searchResult) => {
    persistedOrder();
    mocks.searchProductPaymentIdsByReference.mockResolvedValue(searchResult);

    const response = await POST(request());

    expect(response.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
    expect(mocks.processPaymentDetails).not.toHaveBeenCalled();
    expect(mocks.runNewlyAppliedProductPaymentEffects).not.toHaveBeenCalled();
  });

  it("refetches every accepted candidate and leaves a pending provider payment pending", async () => {
    persistedOrder();
    mocks.searchProductPaymentIdsByReference.mockResolvedValue(["123", "456"]);
    mocks.processPaymentDetails.mockResolvedValue({ result: "acknowledged", settlement: { kind: "product", newlyApplied: false, orderId } });

    const response = await POST(request());

    expect(response.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
    expect(mocks.processPaymentDetails).toHaveBeenNthCalledWith(1, "123");
    expect(mocks.processPaymentDetails).toHaveBeenNthCalledWith(2, "456");
    expect(mocks.runNewlyAppliedProductPaymentEffects).not.toHaveBeenCalled();
  });

  it("routes provider-settled rejected and approved outcomes from the re-read authority", async () => {
    persistedOrder();
    mocks.searchProductPaymentIdsByReference.mockResolvedValue(["123"]);
    mocks.processPaymentDetails.mockResolvedValue({ result: "acknowledged", settlement: { kind: "product", newlyApplied: false, orderId } });
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: orderId, integrity_version: 1, payment_reference: reference, purchase_user_id: "owner", status: "pending" }, error: null })
      .mockResolvedValueOnce({ data: { id: orderId, integrity_version: 1, payment_reference: reference, purchase_user_id: "owner", status: "cancelled" }, error: null });
    expect((await POST(request())).headers.get("location")).toBe("https://clubvtg.test/checkout/failure");

    persistedOrder();
    mocks.searchProductPaymentIdsByReference.mockResolvedValue(["456"]);
    mocks.processPaymentDetails.mockResolvedValue({ result: "acknowledged", settlement: { kind: "product", newlyApplied: true, orderId } });
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: orderId, integrity_version: 1, payment_reference: reference, purchase_user_id: "owner", status: "pending" }, error: null })
      .mockResolvedValueOnce({ data: { id: orderId, integrity_version: 1, payment_reference: reference, purchase_user_id: "owner", status: "paid" }, error: null });
    expect((await POST(request())).headers.get("location")).toBe(`https://clubvtg.test/checkout/success?order_id=${orderId}`);
    expect(mocks.runNewlyAppliedProductPaymentEffects).toHaveBeenCalledWith(orderId);
  });

  it("does not run effects for late, mismatched, or replayed settlements", async () => {
    persistedOrder();
    mocks.searchProductPaymentIdsByReference.mockResolvedValue(["123"]);
    mocks.processPaymentDetails
      .mockResolvedValueOnce({ result: "acknowledged", settlement: { kind: "product", newlyApplied: false, orderId } })
      .mockResolvedValueOnce({ result: "acknowledged", settlement: { kind: "product", newlyApplied: true, orderId: "00000000-0000-0000-0000-000000000001" } })
      .mockResolvedValueOnce({ result: "acknowledged", settlement: { kind: "product", newlyApplied: true, orderId } })
      .mockResolvedValueOnce({ result: "acknowledged", settlement: { kind: "product", newlyApplied: false, orderId } });

    await POST(request());
    await POST(request());
    await POST(request());
    await POST(request());

    expect(mocks.runNewlyAppliedProductPaymentEffects).toHaveBeenCalledOnce();
    expect(mocks.runNewlyAppliedProductPaymentEffects).toHaveBeenCalledWith(orderId);
  });
});
