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

    const checkoutReturnURL = new URL("/checkout", new URL(page.url()).origin).href;
    await Promise.all([
      expect(page).toHaveURL(
        (url) =>
          url.protocol === "https:" &&
          /^[a-z0-9-]+\.accounts\.dev$/.test(url.host) &&
          url.pathname === "/sign-in" &&
          url.username === "" &&
          url.password === "" &&
          url.hash === "" &&
          url.searchParams.getAll("redirect_url").length === 1 &&
          url.searchParams.get("redirect_url") === checkoutReturnURL,
      ),
      storefront.beginCheckout(),
    ]);
    await expect(page.getByRole("heading", { name: "Sign in to clubVTG" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
  },
);
