/* eslint-disable import/order -- Client dependencies must be mocked before import. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/coupon-admin", () => ({ createCoupon: vi.fn(), deactivateCoupon: vi.fn(), replaceCoupon: vi.fn() }));
import { CouponLifecycle } from "./coupon-lifecycle";

describe("CouponLifecycle", () => {
  it("renders deterministic lifecycle selectors and does not render identity internals", () => {
    const html = renderToStaticMarkup(<CouponLifecycle coupons={[{ capacity: 3, code: "SAVE20", endsAt: "2026-09-02T00:00:00Z", id: "coupon-1", startsAt: "2026-09-01T00:00:00Z", state: "replaced", usedCount: 1 }]} />);
    expect(html).toContain('data-testid="coupon-create-form"');
    expect(html).toContain('data-testid="coupon-state-coupon-1"');
    expect(html).toContain("Reemplazado");
    expect(html).not.toMatch(/fingerprint|hmac|identity/i);
  });
});
