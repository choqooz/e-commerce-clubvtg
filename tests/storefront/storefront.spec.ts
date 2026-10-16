import { expect, test } from "@playwright/test";
import { StorefrontPage } from "./storefront-page";

test.describe("cart focus restoration", { tag: ["@e2e", "@storefront"] }, () => {
  test("header opener regains focus after Escape and close-button dismissal and can reopen", async ({
    page,
  }) => {
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    const cartButton = page
      .getByRole("banner")
      .getByRole("button", { name: "Carrito", exact: true });

    await cartButton.focus();
    await cartButton.press("Enter");
    await expect(storefront.cartDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(storefront.cartDialog).toBeHidden();
    await expect(cartButton).toBeFocused();

    await cartButton.press("Space");
    await expect(storefront.cartDialog).toBeVisible();
    await storefront.cartDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(storefront.cartDialog).toBeHidden();
    await expect(cartButton).toBeFocused();
    await cartButton.press("Enter");
    await expect(storefront.cartDialog).toBeVisible();
  });

  test("adding a product restores its own opener after Escape", async ({ page }) => {
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    await storefront.openFirstProduct();
    await expect(storefront.addToCartButton).toBeVisible();
    await storefront.addToCartButton.focus();
    await storefront.addToCartButton.press("Enter");
    await expect(storefront.cartDialog.getByRole("heading", { name: "Carrito (1)" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(storefront.cartDialog).toBeHidden();
    await expect(storefront.addToCartButton).toBeFocused();
  });

  test("programmatic opening without a focused opener falls back to the header cart", async ({
    page,
  }) => {
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    const cartButton = page
      .getByRole("banner")
      .getByRole("button", { name: "Carrito", exact: true });
    // Exercise the real controlled handler without introducing a production test hook.
    await cartButton.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement))
        throw new Error("Expected the header cart button");
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      button.click();
    });
    await expect(storefront.cartDialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(storefront.cartDialog).toBeHidden();
    await expect(cartButton).toBeFocused();
  });

  test("a disconnected product opener falls back to the header cart", async ({ page }) => {
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    await storefront.openFirstProduct();
    await expect(storefront.addToCartButton).toBeVisible();
    const productOpener = await storefront.addToCartButton.elementHandle();
    if (!productOpener) throw new Error("Expected the visible product opener");
    await storefront.addToCartButton.focus();
    await storefront.addToCartButton.press("Enter");
    await expect(storefront.cartDialog.getByRole("heading", { name: "Carrito (1)" })).toBeVisible();
    await productOpener.evaluate((button) => button.remove());

    await page.keyboard.press("Escape");
    await expect(storefront.cartDialog).toBeHidden();
    const cartButton = page
      .getByRole("banner")
      .getByRole("button", { name: "Carrito", exact: true });
    await expect(cartButton).toBeFocused();
  });
});

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
