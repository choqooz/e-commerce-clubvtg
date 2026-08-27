import { type Locator, type Page } from "@playwright/test";
import { BasePage } from "../base-page";

export class OrdersPage extends BasePage {
  readonly emptyOrdersHeading: Locator;
  readonly exploreCatalogLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emptyOrdersHeading = page.getByRole("heading", { name: "No tenés pedidos aún" });
    this.exploreCatalogLink = page.getByRole("link", { name: "Explorar catálogo" });
  }

  async gotoOrders(): Promise<void> {
    await this.goto("/orders");
  }
}
