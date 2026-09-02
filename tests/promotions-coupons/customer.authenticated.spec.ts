import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { CustomerPromotionsCouponsPage } from "./promotions-coupons-page";

interface PromotionsCouponsFixture {
  couponCode: string;
  customerEmail: string;
  historyOrderId: string;
  historyTotalCents: number;
  productSlug: string;
  promotionPercent: number;
}

function fixture(): PromotionsCouponsFixture {
  return JSON.parse(readFileSync(path.join(process.cwd(), "playwright/.promotions-coupons-fixture.json"), "utf8")) as PromotionsCouponsFixture;
}

test(
  "customer quotes without reserving, defaults to promotions, selects a coupon, and reaches authoritative checkout",
  { tag: ["@critical", "@e2e", "@promotions-coupons", "@PROMOTIONS-COUPONS-E2E-001"] },
  async ({ page }) => {
    const runtimeFixture = fixture();
    const customer = new CustomerPromotionsCouponsPage(page);
    await customer.gotoProduct(runtimeFixture.productSlug);
    await expect(page.getByText(`-${runtimeFixture.promotionPercent}% hasta`, { exact: false })).toBeVisible();
    await customer.addConfiguredProductToCart();
    await customer.quoteCoupon(runtimeFixture.couponCode);
    await expect(page.getByRole("radio", { name: "Promociones" })).toBeChecked();
    await customer.chooseCoupon(runtimeFixture.couponCode);
    await customer.handOffToCheckoutProvider(runtimeFixture.customerEmail);
  },
);

test(
  "customer history renders an immutable persisted pricing snapshot",
  { tag: ["@high", "@e2e", "@promotions-coupons", "@PROMOTIONS-COUPONS-E2E-002"] },
  async ({ page }) => {
    const runtimeFixture = fixture();
    await new CustomerPromotionsCouponsPage(page).assertImmutableHistory(runtimeFixture.historyOrderId, runtimeFixture.historyTotalCents);
  },
);
