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

function hasAuthoritativeSnapshot(
  order: PricingHistoryOrder,
): order is AuthoritativePricingHistoryOrder {
  return [
    order.merchandise_original_cents,
    order.merchandise_discount_cents,
    order.merchandise_final_cents,
    order.shipping_cents,
    order.total_cents,
    order.payment_amount_cents,
  ].every((value) => typeof value === "number");
}

export function formatHistoricalOrderTotal(
  order: Pick<PricingHistoryOrder, "total_cents"> & { total_amount: number },
) {
  return typeof order.total_cents === "number"
    ? formatCents(order.total_cents)
    : formatPrice(order.total_amount);
}

export function OrderPricingHistory({ order }: { order: PricingHistoryOrder }) {
  if (!hasAuthoritativeSnapshot(order)) return null;

  const couponCode = order.coupon_definitions?.[0]?.code;
  const source =
    order.pricing_source === "coupon"
      ? `Cupón${couponCode ? ` ${couponCode}` : ""}`
      : order.pricing_source === "promotions"
        ? "Promociones"
        : "Sin fuente registrada";

  return (
    <section
      data-testid="order-pricing-history"
      aria-label="Detalle de precios confirmado"
      className="grid min-w-0 max-w-[560px] gap-[13px] rounded-none border border-midnight-ink bg-warm-sand p-[13px] font-sans text-[15px] leading-[1.3] font-normal text-midnight-ink"
    >
      <div className="grid gap-[6px] break-words">
        <h3 className="text-[20px] font-normal">Detalle de precios confirmado</h3>
        <p>Fuente aplicada: {source}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-[13px] gap-y-[6px] font-mono text-[13px] break-words">
        <dt>Subtotal de productos</dt>
        <dd className="text-right">{formatCents(order.merchandise_original_cents)}</dd>
        <dt>Descuento</dt>
        <dd className="text-right">-{formatCents(order.merchandise_discount_cents)}</dd>
        <dt>Productos con descuento</dt>
        <dd className="text-right">{formatCents(order.merchandise_final_cents)}</dd>
        <dt>Envío</dt>
        <dd className="text-right">{formatCents(order.shipping_cents)}</dd>
        <dt>Total a pagar</dt>
        <dd className="text-right">{formatCents(order.total_cents)}</dd>
        <dt>Monto cobrado</dt>
        <dd className="text-right">{formatCents(order.payment_amount_cents)}</dd>
      </dl>
      {order.product_payment_reversal_evidence.length > 0 && (
        <div
          data-testid="order-reversal-evidence"
          aria-label="Reversiones registradas"
          className="grid gap-[6px] border-t border-midnight-ink pt-[13px]"
        >
          <h3 className="text-[20px] font-normal">Reversiones registradas</h3>
          <ul className="grid gap-[6px] break-words">
            {order.product_payment_reversal_evidence.map((evidence) => (
              <li key={`${evidence.event_class}-${evidence.created_at}`}>
                {REVERSAL_LABELS[evidence.event_class]}:{" "}
                {formatCents(evidence.reversal_total_cents)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
