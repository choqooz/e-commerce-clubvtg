import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentReconciliationHandoff, submitPaymentReconciliationOnce } from "./payment-reconciliation-handoff";

const orderId = "123e4567-e89b-12d3-a456-426614174000";

describe("PaymentReconciliationHandoff", () => {
  it("renders a no-JavaScript POST fallback with only the opaque order locator", () => {
    const markup = renderToStaticMarkup(<PaymentReconciliationHandoff orderId={orderId} />);

    expect(markup).toContain('action="/api/mp-return/reconcile"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain(`type="hidden" name="order_id" value="${orderId}"`);
    expect(markup).toContain("Verificar pago");
    expect(markup).not.toContain("payment_id");
    expect(markup).not.toContain("external_reference");
  });

  it("submits automatically only once", () => {
    const requestSubmit = vi.fn();
    const submitted = { current: false };

    submitPaymentReconciliationOnce({ requestSubmit }, submitted);
    submitPaymentReconciliationOnce({ requestSubmit }, submitted);

    expect(requestSubmit).toHaveBeenCalledOnce();
  });
});
