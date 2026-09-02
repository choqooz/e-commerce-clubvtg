"use client";

import { Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useCart } from "@/contexts/cart-context";
import { quoteCouponCheckout, type CouponQuote } from "@/lib/actions/coupon-quote";
import { COUPON_QUOTE_SOURCES, CUSTOMER_COUPON_SOURCES, isCurrentCouponQuote, isCurrentCouponQuoteResponse, quoteRequestKey, startCouponQuoteRequest, type CouponQuoteRequest, type CouponQuoteSource } from "@/lib/coupon-choice";
import { formatQuoteCents } from "@/lib/quote-display";

const QUOTE_STATUS = { ERROR: "error", IDLE: "idle", LOADING: "loading", SUCCESS: "success" } as const;
type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];

interface QuoteState {
  error: string | null;
  key: string | null;
  quote: CouponQuote | null;
  status: QuoteStatus;
}

export function CouponSelection() {
  const {
    clearCouponSelection,
    couponCode,
    couponSource,
    getCouponQuoteVersion,
    isCouponQuoteVersionCurrent,
    items,
    selectCoupon,
    setCouponCode,
  } = useCart();
  const [quoteState, setQuoteState] = useState<QuoteState>({
    error: null,
    key: null,
    quote: null,
    status: QUOTE_STATUS.IDLE,
  });
  const currentKey = quoteRequestKey(couponCode, items.map((item) => item.product.id));
  const currentRequestRef = useRef<CouponQuoteRequest | null>(null);
  const requestIdentityRef = useRef(0);
  const quote = quoteState.key && isCurrentCouponQuote(quoteState.key, currentKey) ? quoteState.quote : null;
  const error = quoteState.key && isCurrentCouponQuote(quoteState.key, currentKey) ? quoteState.error : null;
  const isLoading = quoteState.status === QUOTE_STATUS.LOADING && quoteState.key === currentKey;

  async function requestQuote(selectedSource?: CouponQuoteSource): Promise<CouponQuote | null> {
    const key = currentKey;
    clearCouponSelection();
    const request = startCouponQuoteRequest(++requestIdentityRef.current, getCouponQuoteVersion());
    currentRequestRef.current = request;
    setQuoteState({ error: null, key, quote: null, status: QUOTE_STATUS.LOADING });
    const result = await quoteCouponCheckout(
      items.map((item) => ({ product: { id: item.product.id }, quantity: 1 as const })),
      couponCode,
      selectedSource,
    );
    if (!isCurrentCouponQuoteResponse(request, currentRequestRef.current, isCouponQuoteVersionCurrent)) return null;
    if (!result.success) {
      setQuoteState({ error: result.error, key, quote: null, status: QUOTE_STATUS.ERROR });
      return null;
    }
    setQuoteState({ error: null, key, quote: result.quote, status: QUOTE_STATUS.SUCCESS });
    return result.quote;
  }

  async function selectCouponQuote() {
    const selectedQuote = await requestQuote(COUPON_QUOTE_SOURCES.COUPON);
    if (selectedQuote) selectCoupon();
  }

  function replaceCoupon(nextCouponCode: string) {
    setCouponCode(nextCouponCode);
    setQuoteState({ error: null, key: null, quote: null, status: QUOTE_STATUS.IDLE });
  }

  function removeCoupon() {
    setCouponCode("");
    setQuoteState({ error: null, key: null, quote: null, status: QUOTE_STATUS.IDLE });
  }

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-labelledby="coupon-selection-heading">
      <div>
        <h3 id="coupon-selection-heading" className="font-heading text-xl">Promociones y cupón</h3>
        <p className="mt-1 text-sm font-sans text-muted-foreground">
          Cotizá un cupón sin reservarlo. La selección final se valida nuevamente al iniciar el pago.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="coupon-code">Código de cupón</label>
        <input
          id="coupon-code"
          value={couponCode}
          onChange={(event) => replaceCoupon(event.target.value)}
          disabled={isLoading}
          placeholder="Código de cupón"
          className="min-w-0 flex-1 border border-border bg-transparent p-3 text-sm font-sans uppercase focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {couponCode ? (
          <button type="button" onClick={removeCoupon} disabled={isLoading} className="inline-flex items-center justify-center gap-2 border border-border px-4 py-3 text-xs font-sans font-medium uppercase tracking-widest hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">
            <X size={14} /> Quitar
          </button>
        ) : null}
        <button type="button" onClick={() => void requestQuote()} disabled={isLoading || couponCode.trim() === "" || items.length === 0} className="bg-primary px-5 py-3 text-xs font-sans font-medium uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Cotizar"}
        </button>
      </div>

      {error ? <p role="alert" className="text-sm font-sans text-destructive">{error}</p> : null}

      {quote ? (
        <fieldset className="space-y-3 border border-border bg-secondary/20 p-4" aria-describedby="coupon-selection-note">
          <legend className="px-1 text-sm font-sans font-medium">Elegí cómo aplicar tu descuento</legend>
          <p id="coupon-selection-note" className="text-xs font-sans text-muted-foreground">
            Sin una selección explícita se conservan las promociones. El cupón y las promociones no se combinan.
          </p>
          <label className="flex cursor-pointer items-start gap-3 border border-border bg-background p-3 has-[:checked]:border-primary">
            <input type="radio" name="pricing-source" checked={couponSource !== CUSTOMER_COUPON_SOURCES.COUPON} onChange={clearCouponSelection} className="mt-1" />
            <span className="flex-1 text-sm font-sans">
              <span className="block font-medium">Promociones</span>
              <span className="block text-muted-foreground">Descuento: {formatQuoteCents(quote.promotionDiscountCents)} · Total con envío: {formatQuoteCents(quote.promotionsPayableCents)}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border border-border bg-background p-3 has-[:checked]:border-primary">
            <input type="radio" name="pricing-source" checked={couponSource === CUSTOMER_COUPON_SOURCES.COUPON} onChange={() => void selectCouponQuote()} disabled={isLoading} className="mt-1" />
            <span className="flex-1 text-sm font-sans">
              <span className="block font-medium">Usar cupón {couponCode.trim().toUpperCase()}</span>
              <span className="block text-muted-foreground">Descuento: {formatQuoteCents(quote.couponDiscountCents)} · Total con envío: {formatQuoteCents(quote.couponPayableCents)}</span>
            </span>
          </label>
        </fieldset>
      ) : null}
    </section>
  );
}
