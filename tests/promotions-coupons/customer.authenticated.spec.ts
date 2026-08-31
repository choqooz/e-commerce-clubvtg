import { expect, test } from "@playwright/test";
import { CustomerPromotionsCouponsPage } from "./promotions-coupons-page";

const couponCode = process.env.E2E_PROMOTIONS_COUPONS_CUSTOMER_COUPON!;
const historyOrderId = process.env.E2E_PROMOTIONS_COUPONS_HISTORY_ORDER_ID!;
const productSlug = process.env.E2E_PROMOTIONS_COUPONS_PRODUCT_SLUG!;
const promotionPercent = process.env.E2E_PROMOTIONS_COUPONS_PROMOTION_PERCENT!;

test(
  "customer quotes without reserving, defaults to promotions, selects a coupon, and reaches authoritative checkout",
  { tag: ["@critical", "@e2e", "@promotions-coupons", "@PROMOTIONS-COUPONS-E2E-001"] },
  async ({ page }) => {
    const customer = new CustomerPromotionsCouponsPage(page);
    await customer.gotoProduct(productSlug);
    await expect(page.getByText(`-${promotionPercent}% hasta`, { exact: false })).toBeVisible();
    await customer.addConfiguredProductToCart();
    await customer.quoteCoupon(couponCode);
    await expect(page.getByRole("radio", { name: "Promociones" })).toBeChecked();
    await customer.chooseCoupon(couponCode);
    await customer.handOffToCheckoutProvider();
  },
);

test(
  "customer history renders an immutable persisted pricing snapshot",
  { tag: ["@high", "@e2e", "@promotions-coupons", "@PROMOTIONS-COUPONS-E2E-002"] },
  async ({ page }) => {
    await new CustomerPromotionsCouponsPage(page).assertImmutableHistory(historyOrderId);
  },
);
