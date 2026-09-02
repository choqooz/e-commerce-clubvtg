import { expect, test } from "@playwright/test";
import { AdminPromotionsCouponsPage } from "./promotions-coupons-page";

let activeCouponCode: string | null = null;

test.afterEach(async ({ page }) => {
  if (!activeCouponCode) return;
  const admin = new AdminPromotionsCouponsPage(page);
  await admin.gotoCoupons();
  await admin.deactivateIfActive(activeCouponCode);
  activeCouponCode = null;
});

test(
  "admin creates, replaces, deactivates, and preserves deterministic coupon lifecycle history",
  { tag: ["@critical", "@e2e", "@promotions-coupons", "@PROMOTIONS-COUPONS-E2E-003"] },
  async ({ page }) => {
    const admin = new AdminPromotionsCouponsPage(page);
    const originalCode = `E2E-ORIGINAL-${Date.now()}`;
    const replacementCode = `E2E-REPLACEMENT-${Date.now()}`;
    await admin.gotoCoupons();
    activeCouponCode = originalCode;
    await admin.submitCoupon(originalCode);
    activeCouponCode = replacementCode;
    await admin.submitCoupon(replacementCode, originalCode);
    await expect(admin.coupon(originalCode).getByText("Reemplazado", { exact: true })).toBeVisible();
    await admin.deactivateIfActive(replacementCode);
    activeCouponCode = null;
    await expect(admin.coupon(replacementCode).getByText("Reemplazo creado", { exact: true })).toBeVisible();
  },
);
