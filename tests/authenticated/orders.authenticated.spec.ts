import { expect, test } from "@playwright/test";
import { OrdersPage } from "./orders-page";

test(
  "authenticated user reaches empty orders without Hosted Sign-in",
  { tag: ["@critical", "@e2e", "@orders", "@ORDERS-E2E-001"] },
  async ({ page }) => {
    const orders = new OrdersPage(page);

    await orders.gotoOrders();

    await expect(page).toHaveURL(/\/orders$/);
    expect(page.url()).not.toContain("accounts.dev/sign-in");
    await expect(orders.emptyOrdersHeading).toBeVisible();
    await expect(orders.exploreCatalogLink).toBeVisible();
  },
);
