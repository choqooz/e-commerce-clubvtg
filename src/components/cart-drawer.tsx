"use client";

import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/contexts/cart-context";
import { formatPrice } from "@/lib/config";

export function CartDrawer() {
  const {
    couponCode,
    items,
    removeItem,
    setCouponCode,
    totalItems,
    totalPrice,
    isOpen,
    setIsOpen,
  } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        aria-describedby={undefined}
        className="flex w-full min-h-0 flex-col gap-[0px] overflow-hidden rounded-none border-midnight-ink bg-bone-white font-sans font-normal text-midnight-ink sm:max-w-[560px] [&>[data-slot=sheet-close]]:size-[44px]"
      >
        <SheetHeader className="shrink-0 border-b border-midnight-ink px-[18px] py-[24px] pr-[72px] sm:px-[30px] sm:pr-[72px]">
          <SheetTitle className="break-words font-sans text-[30px] leading-[1.2] font-normal">
            Carrito ({totalItems})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-warm-sand px-[30px] py-[42px] sm:px-[42px]">
            <p className="my-auto max-w-[10ch] shrink-0 font-sans text-[36px] leading-[1.2] sm:text-[48px]">
              Tu carrito está vacío
            </p>
          </div>
        ) : (
          <>
            <ul className="min-h-0 flex-1 divide-y divide-midnight-ink overflow-y-auto overscroll-contain px-[18px] sm:px-[30px]">
              {items.map((item) => (
                <li
                  key={item.product.id}
                  className="flex items-start gap-[12px] py-[24px] sm:gap-[18px] sm:py-[30px]"
                >
                  {/* Product image */}
                  <div className="relative flex aspect-4/5 w-[88px] shrink-0 items-center justify-center overflow-hidden bg-warm-sand sm:w-[104px]">
                    {item.product.image_urls && item.product.image_urls.length > 0 ? (
                      <Image
                        src={item.product.image_urls[0]}
                        alt={item.product.title}
                        fill
                        sizes="(min-width: 640px) 104px, 88px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="break-all px-[6px] text-center font-mono text-[13px] font-normal uppercase text-midnight-ink">
                        {item.product.category}
                      </span>
                    )}
                  </div>
                  <div className="flex min-h-[110px] min-w-0 flex-1 flex-col sm:min-h-[130px]">
                    <h3 className="break-words font-sans text-[18px] leading-[1.3] font-normal sm:text-[20px]">
                      {item.product.title}
                    </h3>
                    <p className="mt-[6px] break-words font-mono text-[13px] leading-[1.5]">
                      {item.product.color} · Talle {item.product.size}
                    </p>
                    <p className="mt-auto pt-[18px] font-sans text-[20px] leading-[1.3] tabular-nums">
                      {formatPrice(item.product.price)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center self-start rounded-none border border-midnight-ink bg-bone-white text-midnight-ink hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                    aria-label="Quitar producto"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="max-h-[60dvh] shrink-0 space-y-[24px] overflow-y-auto overscroll-contain border-t border-midnight-ink bg-warm-sand px-[18px] py-[24px] pb-[max(24px,env(safe-area-inset-bottom))] sm:px-[30px] sm:py-[30px] sm:pb-[max(30px,env(safe-area-inset-bottom))]">
              <div className="space-y-[12px]">
                <label
                  htmlFor="cart-coupon-code"
                  className="font-mono text-[13px] font-normal uppercase"
                >
                  Cupón
                </label>
                <input
                  id="cart-coupon-code"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                  placeholder="Ingresalo para cotizarlo en checkout"
                  className="h-[48px] w-full rounded-none border border-midnight-ink bg-bone-white px-[12px] py-[6px] font-sans text-[16px] font-normal uppercase text-midnight-ink placeholder:text-concrete-gray focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                />
                <p className="max-w-[36ch] font-sans text-[13px] leading-[1.5]">
                  Elegirás entre el cupón y las promociones antes de pagar.
                </p>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-[18px] gap-y-[6px] border-t border-midnight-ink pt-[18px]">
                <span className="font-mono text-[13px] leading-[1.3]">Total</span>
                <span className="font-sans text-[30px] leading-[1.2] font-normal tabular-nums">
                  {formatPrice(totalPrice)}
                </span>
              </div>
              <Link
                href="/checkout"
                onClick={() => setIsOpen(false)}
                className="flex min-h-[48px] w-full items-center justify-center rounded-none border border-midnight-ink bg-midnight-ink px-[18px] py-[12px] text-center font-mono text-[13px] font-normal uppercase text-bone-white hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              >
                Ir al Checkout
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
