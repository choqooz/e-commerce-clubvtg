/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The route tests use compact response doubles at the network boundary.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from } }));

const orderId = "123e4567-e89b-12d3-a456-426614174000";
const foreignOrderId = "123e4567-e89b-12d3-a456-426614174001";
const proofCookie = "clubvtg-cart-clear-order";

function request({
  cookie,
  headers: extraHeaders = {},
  order = orderId,
  origin = "https://clubvtg.test",
  url = "https://clubvtg.test/api/mp-return/cart-clear-proof/consume",
  withOrigin = true,
} = {}) {
  const form = new URLSearchParams({ order_id: order });
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded", ...extraHeaders });
  if (cookie) headers.set("cookie", `${proofCookie}=${cookie}`);
  if (withOrigin) headers.set("origin", origin);
  return new NextRequest(url, { body: form, headers, method: "POST" });
}

function persistedOrder(status = "paid", owner = "owner", integrityVersion = 1) {
  mocks.auth.mockResolvedValue({ userId: owner });
  mocks.maybeSingle.mockResolvedValue({
    data: { id: orderId, integrity_version: integrityVersion, payment_reference: `order:${orderId}`, purchase_user_id: owner, status },
    error: null,
  });
  const query = { eq: vi.fn(), maybeSingle: mocks.maybeSingle, select: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
}

describe("cart-clear proof consumption", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://clubvtg.test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.unstubAllGlobals();
  });

  it("consumes a proof for the configured public Origin when the route URL is internal behind a proxy", async () => {
    persistedOrder();

    const response = await POST(request({ cookie: orderId, url: "http://next.internal/api/mp-return/cart-clear-proof/consume" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it.each([
    ["missing", undefined],
    ["relative", "/checkout"],
    ["non-HTTP", "ftp://clubvtg.test"],
    ["missing authority delimiter", "https:/clubvtg.test"],
    ["malformed", "https://"],
  ])("fails closed for a %s configured public origin", async (_name, appUrl) => {
    persistedOrder();
    if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = appUrl;

    const response = await POST(request({ cookie: orderId, url: "http://next.internal/api/mp-return/cart-clear-proof/consume" }));

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not trust Host or forwarded headers as origin authority", async () => {
    persistedOrder();

    const response = await POST(request({
      cookie: orderId,
      headers: {
        forwarded: "host=clubvtg.test;proto=https",
        host: "clubvtg.test",
        "x-forwarded-host": "clubvtg.test",
        "x-forwarded-proto": "https",
      },
      origin: "https://attacker.test",
      url: "http://next.internal/api/mp-return/cart-clear-proof/consume",
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
    persistedOrder();

    expect((await POST(request({ cookie: orderId, origin, url: "http://next.internal/api/mp-return/cart-clear-proof/consume" }))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects configured public origins with a path, query, or fragment", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://clubvtg.test:443/checkout?return=1#payment";
    persistedOrder();

    expect((await POST(request({ cookie: orderId, origin: "https://clubvtg.test/", url: "http://next.internal/api/mp-return/cart-clear-proof/consume" }))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("consumes a matching proof only after a fresh owned integrity-v1 paid lookup", async () => {
    persistedOrder();

    const response = await POST(request({ cookie: orderId }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ consumed: true });
    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(response.headers.get("set-cookie")).toContain(`${proofCookie}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("Path=/api/mp-return/cart-clear-proof/consume");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it.each([
    ["missing", undefined],
    ["expired", ""],
    ["mismatched", foreignOrderId],
  ])("fails closed for a %s proof", async (_name, cookie) => {
    persistedOrder();

    const response = await POST(request({ cookie }));

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed when the browser replays after a successful consumption", async () => {
    persistedOrder();

    expect((await POST(request({ cookie: orderId }))).status).toBe(200);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.from).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated, invalid-Origin, and invalid-UUID attempts", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request({ cookie: orderId }))).status).toBe(401);

    persistedOrder();
    expect((await POST(request({ cookie: orderId, origin: "https://attacker.test" }))).status).toBe(403);
    expect((await POST(request({ cookie: orderId, withOrigin: false }))).status).toBe(403);
    expect((await POST(request({ cookie: "not-a-uuid", order: "not-a-uuid" }))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects a matching proof for a foreign order", async () => {
    persistedOrder();
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    expect((await POST(request({ cookie: orderId }))).status).toBe(404);
  });

  it.each(["pending", "cancelled", "shipped"]) ("does not consume a matching proof for a %s order", async (status) => {
    persistedOrder(status);

    expect((await POST(request({ cookie: orderId }))).status).toBe(403);
  });
});
