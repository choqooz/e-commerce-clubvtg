import { expect, test } from "@playwright/test";
import { StorefrontPage } from "./storefront-page";

test.describe("editorial collection", { tag: ["@e2e", "@storefront"] }, () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`keeps composition, unique cards and search history at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const storefront = new StorefrontPage(page);
      await storefront.gotoCatalog();
      await expect(storefront.catalogHeading).toHaveText("Todas las prendas");
      await expect(storefront.productLinks.first()).toBeVisible();
      const catalog = page.locator("#catalog");
      const originalLinks = await storefront.productLinks.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      );
      expect(new Set(originalLinks).size).toBe(originalLinks.length);
      const cover = catalog.locator("[data-collection-hero]");
      await expect(cover).toBeVisible();
      const grid = catalog.locator("[data-collection-products]");
      const coverBox = (await cover.boundingBox())!;
      const gridBox = (await grid.boundingBox())!;
      if (viewport.width >= 1024) {
        expect(Math.abs(coverBox.width - gridBox.width)).toBeLessThan(2);
        expect(gridBox.x).toBeGreaterThan(coverBox.x + coverBox.width);
      } else {
        expect(gridBox.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const title = (await storefront.productLinks.first().getByRole("heading").innerText()).trim();
      const banner = page.getByRole("banner");
      if (viewport.width < 768) {
        await banner.getByRole("button", { name: "Abrir menú", exact: true }).click();
        await page
          .getByRole("navigation", { name: "Navegación móvil", exact: true })
          .getByRole("button", { name: "Buscar", exact: true })
          .click();
      } else {
        await banner.getByRole("button", { name: "Buscar", exact: true }).click();
      }
      const search = banner.getByRole("searchbox", { name: "Buscar prendas" });
      await search.fill(title);
      await banner.getByRole("button", { name: "Buscar prendas", exact: true }).click();
      await expect(storefront.catalogHeading).toHaveText(`Búsqueda: “${title}”`);
      await expect(storefront.productLinks.first()).toBeVisible();
      const matches = await storefront.productLinks.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      );
      expect(matches).toContain(originalLinks[0]);
      expect(new Set(matches).size).toBe(matches.length);
      await expect(page.getByRole("button", { name: "Limpiar búsqueda", exact: true })).toHaveCount(
        1,
      );
      await banner.getByRole("button", { name: "Limpiar búsqueda", exact: true }).click();
      await expect(search).toHaveValue("");
      await expect(search).toBeFocused();
      await expect(storefront.catalogHeading).toHaveText("Todas las prendas");
      await expect(storefront.productLinks).toHaveCount(originalLinks.length);
      await page.goBack();
      await expect(search).toHaveValue(title);
      await expect(storefront.catalogHeading).toHaveText(`Búsqueda: “${title}”`);
      await page.goForward();
      await expect(search).toHaveValue("");
      await expect(storefront.productLinks).toHaveCount(originalLinks.length);
    });
  }

  test("keeps the compact category selector, one filter reset and back-to-entry action", async ({
    page,
  }) => {
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    const category = page.getByRole("combobox", { name: "Categoría", exact: true });
    await expect(category).toHaveValue("all");
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filtros" });
    await filters.getByRole("button", { pressed: false }).first().click();
    await expect(filters.getByRole("button", { name: "Limpiar filtros", exact: true })).toHaveCount(
      1,
    );
    await filters.getByRole("button", { name: /^Ver \d+ prendas?$/ }).click();
    await expect(page.getByRole("button", { name: "Filtros (1)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Filtros (1)", exact: true }).click();
    await filters.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await expect(filters.getByRole("button", { name: "Limpiar filtros", exact: true })).toHaveCount(
      0,
    );
    await filters.getByRole("button", { name: /^Ver \d+ prendas?$/ }).click();
    await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
    await expect(page.getByRole("region", { name: "Explorar por categoría" })).toBeVisible();
    await expect(page.locator("#catalog")).toBeHidden();
    await page.goBack();
    await expect(storefront.catalogHeading).toHaveText("Todas las prendas");
  });
});

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
