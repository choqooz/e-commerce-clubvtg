import { expect, test } from "@playwright/test";
import { StorefrontPage } from "./storefront-page";

test(
  "guest reaches hosted Clerk sign-in when starting checkout",
  { tag: ["@critical", "@e2e", "@storefront", "@STOREFRONT-E2E-001"] },
  async ({ page }) => {
    const storefront = new StorefrontPage(page);

    await storefront.gotoCatalog();
    await storefront.openFirstProduct();
    await expect(storefront.addToCartButton).toBeVisible();

    await storefront.addFirstProductToCart();
    await expect(storefront.cartDialog.getByRole("heading", { name: "Carrito (1)" })).toBeVisible();

    await Promise.all([
      expect(page).toHaveURL(
        /^https:\/\/[a-z0-9-]+\.accounts\.dev\/sign-in\?redirect_url=http%3A%2F%2F(?:127\.0\.0\.1|localhost)%3A3000%2Fcheckout(?:&.*)?$/,
      ),
      storefront.beginCheckout(),
    ]);
    await expect(page.getByRole("heading", { name: "Sign in to clubVTG" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
  },
);
