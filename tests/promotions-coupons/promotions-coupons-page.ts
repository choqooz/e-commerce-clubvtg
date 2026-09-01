import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../base-page";

const CHECKOUT_DETAILS = {
  city: "CABA",
  dni: "12345678",
  email: "customer@example.test",
  fullName: "Customer Fixture",
  number: "123",
  phone: "1112345678",
  province: "Buenos Aires",
  street: "Fixture Street",
  zipCode: "1000",
} as const;

export class CustomerPromotionsCouponsPage extends BasePage {
  readonly addToCartButton: Locator;
  readonly cartDialog: Locator;
  readonly checkoutForm: Locator;
  readonly couponCodeInput: Locator;

  constructor(page: Page) {
    super(page);
    this.addToCartButton = page.getByRole("button", { name: "Agregar al carrito" });
    this.cartDialog = page.getByRole("dialog");
    this.checkoutForm = page.getByTestId("checkout-form");
    this.couponCodeInput = page.getByLabel("Código de cupón");
  }

  async gotoProduct(slug: string): Promise<void> {
    await this.goto(`/product/${slug}`);
  }

  async addConfiguredProductToCart(): Promise<void> {
    await this.addToCartButton.click();
    await expect(this.cartDialog).toBeVisible();
    await this.cartDialog.getByRole("link", { name: "Ir al Checkout" }).click();
    await expect(this.checkoutForm).toBeVisible();
  }

  async quoteCoupon(code: string): Promise<void> {
    await this.couponCodeInput.fill(code);
    await this.checkoutForm.getByRole("button", { name: "Cotizar" }).click();
    await expect(this.checkoutForm.getByRole("group", { name: "Elegí cómo aplicar tu descuento" })).toBeVisible();
  }

  async chooseCoupon(code: string): Promise<void> {
    await this.checkoutForm.getByRole("radio", { name: `Usar cupón ${code}` }).check();
    await expect(this.checkoutForm.getByRole("radio", { name: `Usar cupón ${code}` })).toBeChecked();
  }

  async handOffToCheckoutProvider(customerEmail: string): Promise<void> {
    await this.checkoutForm.getByLabel("Nombre Completo").fill(CHECKOUT_DETAILS.fullName);
    await this.checkoutForm.getByLabel("Email").fill(customerEmail);
    await this.checkoutForm.getByLabel("DNI").fill(CHECKOUT_DETAILS.dni);
    await this.checkoutForm.getByLabel("Teléfono").fill(CHECKOUT_DETAILS.phone);
    await this.checkoutForm.getByLabel("Calle").fill(CHECKOUT_DETAILS.street);
    await this.checkoutForm.getByLabel("Número").fill(CHECKOUT_DETAILS.number);
    await this.checkoutForm.getByLabel("Ciudad").fill(CHECKOUT_DETAILS.city);
    await this.checkoutForm.getByLabel("Provincia").fill(CHECKOUT_DETAILS.province);
    await this.checkoutForm.getByLabel("CP").fill(CHECKOUT_DETAILS.zipCode);
    await Promise.all([
      this.page.waitForURL(/\/e2e\/payment-handoff\?order_id=/),
      this.checkoutForm.getByRole("button", { name: "Pagar con MercadoPago" }).click(),
    ]);
  }

  async assertImmutableHistory(orderId: string, totalCents: number): Promise<void> {
    await this.goto("/orders");
    const order = this.page.locator("article").filter({ hasText: `#${orderId.slice(0, 8)}` });
    await expect(order.getByTestId("order-pricing-history")).toBeVisible();
    await expect(order.getByText("Total a pagar", { exact: true })).toBeVisible();
    await expect(order.getByText((totalCents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }))).toBeVisible();
  }
}

export class AdminPromotionsCouponsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoCoupons(): Promise<void> {
    await this.goto("/admin/coupons");
    await expect(this.page.getByRole("heading", { name: "Cupones" })).toBeVisible();
  }

  async submitCoupon(code: string, replacementCode?: string): Promise<void> {
    const form = this.page.getByTestId("coupon-create-form");
    const startsAt = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
    const endsAt = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    await form.getByLabel("Código").fill(code);
    await form.getByLabel("Capacidad").fill("1");
    await form.getByLabel("Inicio UTC").fill(startsAt);
    await form.getByLabel("Fin UTC").fill(endsAt);
    await form.getByLabel("Tipo de descuento").selectOption("percentage");
    await form.getByLabel("Descuento").fill("10");
    if (replacementCode) {
      await form.getByLabel("Cupón a reemplazar").selectOption({ label: `Reemplazar ${replacementCode}` });
      await form.getByLabel("Motivo de reemplazo").fill("Fixture lifecycle replacement");
    }
    await form.getByRole("button", { name: "Guardar cupón" }).click();
    await expect(this.page.getByTestId("coupon-list").getByText(code, { exact: true })).toBeVisible();
  }

  async deactivateIfActive(code: string): Promise<void> {
    const coupon = this.coupon(code);
    const reason = coupon.getByLabel(`Motivo de desactivación ${code}`);
    if (await reason.isVisible()) {
      await reason.fill("Fixture lifecycle cleanup");
      await coupon.getByRole("button", { name: "Desactivar" }).click();
    }
  }

  coupon(code: string): Locator {
    return this.page.getByTestId("coupon-list").locator("article").filter({ has: this.page.getByText(code, { exact: true }) });
  }
}
