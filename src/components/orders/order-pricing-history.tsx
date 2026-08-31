import type { OrderHistoryOrder } from "@/lib/actions/orders";
import { formatPrice } from "@/lib/config";

type PricingHistoryOrder = Pick<
  OrderHistoryOrder,
  | "coupon_definitions"
  | "merchandise_discount_cents"
  | "merchandise_final_cents"
  | "merchandise_original_cents"
  | "payment_amount_cents"
  | "pricing_source"
  | "product_payment_reversal_evidence"
  | "shipping_cents"
  | "total_cents"
>;

interface AuthoritativePricingHistoryOrder extends PricingHistoryOrder {
  merchandise_discount_cents: number;
  merchandise_final_cents: number;
  merchandise_original_cents: number;
  payment_amount_cents: number;
  shipping_cents: number;
  total_cents: number;
}

const REVERSAL_LABELS = {
  charged_back: "Contracargo registrado",
  refunded: "Reintegro registrado",
} as const;

function formatCents(cents: number) {
  return formatPrice(cents / 100);
}

function hasAuthoritativeSnapshot(order: PricingHistoryOrder): order is AuthoritativePricingHistoryOrder {
  return [
    order.merchandise_original_cents,
    order.merchandise_discount_cents,
    order.merchandise_final_cents,
    order.shipping_cents,
    order.total_cents,
    order.payment_amount_cents,
  ].every((value) => typeof value === "number");
}

export function formatHistoricalOrderTotal(order: Pick<PricingHistoryOrder, "total_cents"> & { total_amount: number }) {
  return typeof order.total_cents === "number" ? formatCents(order.total_cents) : formatPrice(order.total_amount);
}

export function OrderPricingHistory({ order }: { order: PricingHistoryOrder }) {
  if (!hasAuthoritativeSnapshot(order)) return null;

  const couponCode = order.coupon_definitions[0]?.code;
  const source = order.pricing_source === "coupon" ? `Cupón${couponCode ? ` ${couponCode}` : ""}` : order.pricing_source === "promotions" ? "Promociones" : "Sin fuente registrada";

  return (
    <section data-testid="order-pricing-history" aria-label="Detalle de precios confirmado" className="space-y-3 text-sm">
      <div>
        <h3 className="font-medium">Detalle de precios confirmado</h3>
        <p className="text-muted-foreground">Fuente aplicada: {source}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Subtotal de productos</dt><dd className="text-right text-foreground">{formatCents(order.merchandise_original_cents)}</dd>
        <dt>Descuento</dt><dd className="text-right text-foreground">-{formatCents(order.merchandise_discount_cents)}</dd>
        <dt>Productos con descuento</dt><dd className="text-right text-foreground">{formatCents(order.merchandise_final_cents)}</dd>
        <dt>Envío</dt><dd className="text-right text-foreground">{formatCents(order.shipping_cents)}</dd>
        <dt className="font-medium text-foreground">Total a pagar</dt><dd className="text-right font-medium text-foreground">{formatCents(order.total_cents)}</dd>
        <dt>Monto cobrado</dt><dd className="text-right text-foreground">{formatCents(order.payment_amount_cents)}</dd>
      </dl>
      {order.product_payment_reversal_evidence.length > 0 && (
        <div data-testid="order-reversal-evidence" aria-label="Reversiones registradas">
          <h3 className="font-medium">Reversiones registradas</h3>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {order.product_payment_reversal_evidence.map((evidence) => (
              <li key={`${evidence.event_class}-${evidence.created_at}`}>
                {REVERSAL_LABELS[evidence.event_class]}: {formatCents(evidence.reversal_total_cents)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
