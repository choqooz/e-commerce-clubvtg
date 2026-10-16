"use client";

import { ChevronRight, ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CheckoutForm } from "@/components/checkout-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useCart } from "@/contexts/cart-context";
import { formatPrice, SHIPPING_FEE } from "@/lib/config";

export default function CheckoutPage() {
  const { items, totalPrice } = useCart();

  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3] flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="w-full px-[18px] py-[18px] md:px-[30px]">
          <nav className="flex flex-wrap items-center gap-[6px] font-mono text-[13px] text-midnight-ink">
            <Link
              href="/"
              className="hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <span>Carrito</span>
            <ChevronRight size={12} />
            <span className="text-midnight-ink">Checkout</span>
          </nav>
        </div>

        <div className="w-full px-[18px] pb-[42px] pt-[30px] md:px-[30px]">
          <div className="flex items-center mb-[42px]">
            <Link
              href="/"
              className="min-h-[44px] text-midnight-ink hover:underline flex items-center gap-[6px] text-[13px] font-mono font-normal uppercase focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              <ArrowLeft size={16} />
              Seguir Comprando
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-[42px] xl:gap-[72px] items-start">
            {/* Left Col: Form */}
            <div className="min-w-0 lg:col-span-7">
              <div className="mb-[42px] border-b border-midnight-ink pb-[36px]">
                <h1 className="max-w-[12ch] font-sans text-[42px] sm:text-[60px] font-normal leading-[1] mb-[18px]">
                  Finalizar Compra
                </h1>
                <p className="text-midnight-ink font-sans text-[15px]">
                  Completá tus datos para el envío y pago.
                </p>
              </div>

              {items.length > 0 ? (
                <CheckoutForm />
              ) : (
                <div className="flex min-h-[240px] flex-col items-start justify-center border border-midnight-ink p-[24px] sm:p-[36px] bg-warm-sand">
                  <p className="max-w-[18ch] text-midnight-ink font-sans text-[30px] leading-[1.2] mb-[30px]">
                    No tenés productos en el carrito.
                  </p>
                  <Link
                    href="/"
                    className="inline-flex min-h-[48px] items-center justify-center border border-midnight-ink bg-midnight-ink text-bone-white py-[12px] px-[18px] text-[13px] uppercase font-mono font-normal hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
                  >
                    Ir al Catálogo
                  </Link>
                </div>
              )}
            </div>

            {/* Right Col: Summary */}
            <aside
              aria-labelledby="checkout-summary-heading"
              className="min-w-0 lg:col-span-5 lg:sticky lg:top-[156px]"
            >
              <div className="border border-midnight-ink p-[24px] xl:p-[36px] bg-warm-sand">
                <h2
                  id="checkout-summary-heading"
                  className="max-w-[14ch] font-sans font-normal text-[30px] leading-[1.2] mb-[30px]"
                >
                  Resumen de la Orden
                </h2>

                <div className="divide-y divide-midnight-ink mb-[30px]">
                  {items.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex gap-[18px] py-[24px] first:pt-0 last:pb-0"
                    >
                      {/* Product image */}
                      <div className="relative w-[88px] h-[110px] xl:w-[104px] xl:h-[130px] bg-bone-white shrink-0 overflow-hidden">
                        {item.product.image_urls && item.product.image_urls.length > 0 ? (
                          <Image
                            src={item.product.image_urls[0]}
                            alt={item.product.title}
                            fill
                            sizes="(min-width: 1280px) 104px, 88px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[13px] text-midnight-ink font-mono break-all uppercase">
                              {item.product.category}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 min-w-0 flex-col items-start">
                        <h4 className="text-[20px] leading-[1.3] font-sans break-words font-normal">
                          {item.product.title}
                        </h4>
                        <p className="text-[13px] leading-[1.5] text-midnight-ink font-mono mt-[6px] break-words uppercase">
                          Talle {item.product.size || "Único"}
                        </p>
                        <p className="text-[15px] font-sans tabular-nums mt-auto pt-[18px]">
                          {formatPrice(item.product.price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-midnight-ink pt-[24px] space-y-[18px] font-sans text-[15px] leading-[1.5] [&_span:last-child]:shrink-0 [&_span:last-child]:tabular-nums">
                  <div className="flex justify-between gap-[13px] text-midnight-ink">
                    <span>Subtotal</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between gap-[13px] text-midnight-ink">
                    <span>Envío (Correo Argentino)</span>
                    <span>{formatPrice(SHIPPING_FEE)}</span>
                  </div>

                  <div className="flex justify-between gap-[13px] font-normal text-[30px] leading-[1.2] pt-[24px] border-t border-midnight-ink">
                    <span>Total</span>
                    <span>{formatPrice(totalPrice + SHIPPING_FEE)}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
