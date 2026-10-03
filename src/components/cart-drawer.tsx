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
        className="flex w-full min-h-0 flex-col border-midnight-ink bg-bone-white font-sans font-normal text-midnight-ink sm:max-w-[448px]"
      >
        <SheetHeader className="shrink-0 border-b border-midnight-ink pb-[18px]">
          <SheetTitle className="font-sans text-[20px] leading-[1.3] font-normal">
            Carrito ({totalItems})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-[24px]">
            <p className="font-sans text-[15px] leading-[1.3]">Tu carrito está vacío</p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto px-[24px] py-[18px]">
              {items.map((item) => (
                <div key={item.product.id} className="flex gap-[13px]">
                  {/* Product image */}
                  <div className="relative flex h-[96px] w-[80px] shrink-0 items-center justify-center overflow-hidden bg-warm-sand">
                    {item.product.image_urls && item.product.image_urls.length > 0 ? (
                      <Image
                        src={item.product.image_urls[0]}
                        alt={item.product.title}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="break-all px-[6px] text-center font-mono text-[13px] font-normal uppercase text-midnight-ink">
                        {item.product.category}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="truncate font-sans text-[15px] leading-[1.3]">
                      {item.product.title}
                    </h4>
                    <p className="mt-[2px] font-mono text-[13px] leading-[1.3]">
                      {item.product.color} · Talle {item.product.size}
                    </p>
                    <p className="mt-[6px] font-sans text-[15px] leading-[1.3]">
                      {formatPrice(item.product.price)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="flex h-[28px] w-[28px] shrink-0 items-center justify-center self-start border border-midnight-ink bg-bone-white text-midnight-ink hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                    aria-label="Quitar producto"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="max-h-[60dvh] shrink-0 space-y-[13px] overflow-y-auto border-t border-midnight-ink bg-warm-sand p-[24px]">
              <div className="space-y-[6px]">
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
                  className="h-[36px] w-full rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-sans text-[16px] font-normal uppercase text-midnight-ink placeholder:text-concrete-gray md:text-[15px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                />
                <p className="font-sans text-[15px] leading-[1.3]">
                  Elegirás entre el cupón y las promociones antes de pagar.
                </p>
              </div>
              <div className="flex flex-wrap justify-between gap-[6px] font-mono text-[13px] leading-[1.3]">
                <span>Total</span>
                <span className="font-normal">{formatPrice(totalPrice)}</span>
              </div>
              <Link
                href="/checkout"
                onClick={() => setIsOpen(false)}
                className="flex min-h-[36px] w-full items-center justify-center border border-midnight-ink bg-midnight-ink px-[6px] py-[2px] text-center font-mono text-[13px] font-normal uppercase text-bone-white hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
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
