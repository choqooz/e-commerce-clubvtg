import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../base-page";

export class StorefrontPage extends BasePage {
  readonly catalogHeading: Locator;
  readonly productLinks: Locator;
  readonly addToCartButton: Locator;
  readonly cartDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.catalogHeading = page.getByRole("heading", { name: "Catálogo" });
    this.productLinks = page.getByRole("main").locator('a[href^="/product/"]');
    this.addToCartButton = page.getByRole("button", { name: "Agregar al carrito" });
    this.cartDialog = page.getByRole("dialog");
  }

  async gotoCatalog(): Promise<void> {
    await this.goto("/");
    await expect(this.catalogHeading).toBeVisible();
  }

  async openFirstProduct(): Promise<void> {
    await expect(this.productLinks).not.toHaveCount(0);
    const productLink = this.productLinks.first();
    const href = await productLink.getAttribute("href");
    expect(href, "The selected product link must have a navigation destination").not.toBeNull();
    const productURL = new URL(href!, new URL(this.page.url()).origin).href;

    await productLink.click();
    await this.page.waitForURL(productURL, { waitUntil: "commit" });
  }

  async addFirstProductToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  async beginCheckout(): Promise<void> {
    await this.cartDialog.getByRole("link", { name: "Ir al Checkout" }).click();
  }
}
