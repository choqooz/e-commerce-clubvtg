import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutSuccessPage from "../../(shop)/checkout/success/page";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
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

function persistedOrder(status: "paid" | "pending" | "cancelled", owner = "owner") {
  mocks.auth.mockResolvedValue({ userId: owner });
  mocks.maybeSingle.mockResolvedValue({
    data: { id: orderId, purchase_user_id: owner, status },
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

    expect(response.headers.get("location")).toBe("https://clubvtg.test/checkout/pending");
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

  it("maps only a persisted owned terminal state to its return projection", async () => {
    persistedOrder("paid");
    const paid = await GET(request(`?order_id=${orderId}&status=failure`));

    persistedOrder("cancelled");
    const cancelled = await GET(request(`?order_id=${orderId}&status=success`));

    expect(paid.headers.get("location")).toBe(`https://clubvtg.test/checkout/success?order_id=${orderId}`);
    expect(cancelled.headers.get("location")).toBe("https://clubvtg.test/checkout/failure");
  });

  it("renders historical paid success without mutating a fresh cart on direct, refresh, or replay", async () => {
    persistedOrder("paid");
    const newerCart = ["newer-product"];

    const direct = await CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: orderId }) });
    const refreshed = await CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: orderId }) });
    const replay = await CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: orderId }) });

    expect(direct).toBeTruthy();
    expect(refreshed).toBeTruthy();
    expect(replay).toBeTruthy();
    expect(newerCart).toEqual(["newer-product"]);
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });
});
