import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartClearOnAuthoritativePayment } from "@/components/cart-clear-on-authoritative-payment";
import CheckoutSuccessPage from "../../(shop)/checkout/success/page";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

const orderId = "123e4567-e89b-12d3-a456-426614174000";

function request(query = "") {
  return new Request(`https://clubvtg.test/api/mp-return${query}`);
}

function persistedOrder(status: "paid" | "pending" | "cancelled" | "shipped", owner = "owner", integrityVersion = 1) {
  mocks.auth.mockResolvedValue({ userId: owner });
  mocks.maybeSingle.mockResolvedValue({
    data: { id: orderId, integrity_version: integrityVersion, payment_reference: `order:${orderId}`, purchase_user_id: owner, status },
    error: null,
  });
  const query = {
    eq: vi.fn(),
    maybeSingle: mocks.maybeSingle,
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  return query;
}

function containsCartClearEffect(node: ReactNode): boolean {
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  return node.type === CartClearOnAuthoritativePayment || Children.toArray(node.props.children).some(containsCartClearEffect);
}

describe("MercadoPago return authority", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://clubvtg.test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it.each([["status", `?order_id=${orderId}&status=success`], ["reference", `?order_id=${orderId}&external_reference=order:${orderId}`], ["payment type", `?order_id=${orderId}&type=payment`]])("does not project forged %s input as a successful order", async (_field, query) => {
    persistedOrder("pending");

    const response = await GET(request(query));

    expect(response.headers.get("location")).toBe(`https://clubvtg.test/checkout/reconcile?order_id=${orderId}`);
    expect(mocks.from).toHaveBeenCalledWith("orders");
  });

  it("does not let a foreign authenticated user observe another user's paid order", async () => {
    persistedOrder("paid", "owner");
    mocks.auth.mockResolvedValue({ userId: "attacker" });

    const response = await GET(request(`?order_id=${orderId}&status=success`));

    expect(response.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
    expect(mocks.from).toHaveBeenCalledWith("orders");
  });

  it("keeps missing, malformed, unauthenticated, and non-persisted returns non-successful", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const unauthenticated = await GET(request(`?order_id=${orderId}&status=success`));
    const malformed = await GET(request("?order_id=not-a-uuid&status=success"));
    const missing = await GET(request("?status=success"));

    expect(unauthenticated.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
    expect(malformed.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
    expect(missing.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("routes owned paid returns through authenticated reconciliation and projects cancellation as failure", async () => {
    persistedOrder("paid");
    const paid = await GET(request(`?order_id=${orderId}&status=failure`));

    persistedOrder("cancelled");
    const cancelled = await GET(request(`?order_id=${orderId}&status=success`));

    expect(paid.headers.get("location")).toBe(`https://clubvtg.test/checkout/reconcile?order_id=${orderId}`);
    expect(cancelled.headers.get("location")).toBe("https://clubvtg.test/checkout/failure");
  });

  it("keeps GET limited to the owned return projection before the POST reconciliation handoff", async () => {
    persistedOrder("pending");

    const response = await GET(request(`?order_id=${orderId}`));

    expect(response.headers.get("location")).toBe(`https://clubvtg.test/checkout/reconcile?order_id=${orderId}`);
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith("orders");
  });

  it("mounts the cart proof-consumption effect only for an owned paid order", async () => {
    persistedOrder("paid");

    const reconciledSuccess = await CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: orderId }) });

    expect(containsCartClearEffect(reconciledSuccess)).toBe(true);
  });

  it("does not mount the cart-clear effect for shipped or integrity-mismatched orders", async () => {
    persistedOrder("shipped");

    const shippedSuccess = await CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: orderId }) });

    expect(containsCartClearEffect(shippedSuccess)).toBe(false);

    persistedOrder("paid", "owner", 2);
    await expect(CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: orderId }) })).rejects.toThrow("redirect:");
  });

  it.each([
    ["pending", "pending", { order_id: orderId, status: "success" }],
    ["failed or cancelled", "cancelled", { order_id: orderId }],
    ["missing", null, {}],
    ["foreign", "paid", { order_id: orderId }],
    ["unauthenticated", null, { order_id: orderId }],
  ])("never reads a cart-clear proof for %s success navigation", async (name, status, searchParams) => {
    if (status) persistedOrder(status as "paid" | "pending" | "cancelled");
    if (name === "foreign") mocks.auth.mockResolvedValue({ userId: "attacker" });
    if (name === "unauthenticated") mocks.auth.mockResolvedValue({ userId: null });

    await expect(CheckoutSuccessPage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow("redirect:");
  });
});
