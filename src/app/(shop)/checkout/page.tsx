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
            <Link href="/" className="hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2">
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
              className="text-midnight-ink hover:underline flex items-center gap-[6px] text-[13px] font-mono font-normal uppercase focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              <ArrowLeft size={16} />
              Seguir Comprando
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-[42px] items-start">
            {/* Left Col: Form */}
            <div className="min-w-0 lg:col-span-7 xl:col-span-8">
              <div className="mb-[30px]">
                <h1 className="font-sans text-[30px] font-normal leading-[1.2] mb-[6px]">Finalizar Compra</h1>
                <p className="text-midnight-ink font-sans text-[15px]">
                  Completá tus datos para el envío y pago.
                </p>
              </div>

              {items.length > 0 ? (
                <CheckoutForm />
              ) : (
                <div className="border border-midnight-ink p-[24px] text-center bg-warm-sand">
                  <p className="text-midnight-ink font-sans mb-[18px]">
                    No tenés productos en el carrito.
                  </p>
                  <Link
                    href="/"
                    className="inline-flex min-h-[36px] items-center justify-center border border-midnight-ink bg-midnight-ink text-bone-white py-[2px] px-[6px] text-[13px] uppercase font-mono font-normal hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
                  >
                    Ir al Catálogo
                  </Link>
                </div>
              )}
            </div>

            {/* Right Col: Summary */}
            <div className="min-w-0 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-[156px]">
              <div className="border border-midnight-ink p-[13px] md:p-[24px] bg-warm-sand">
                <h2 className="font-sans font-normal text-[20px] mb-[24px]">Resumen de la Orden</h2>

                <div className="space-y-[18px] mb-[24px]">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex gap-[13px]">
                      {/* Product image */}
                      <div className="relative w-[64px] h-[80px] bg-bone-white shrink-0 overflow-hidden">
                        {item.product.image_urls && item.product.image_urls.length > 0 ? (
                          <Image
                            src={item.product.image_urls[0]}
                            alt={item.product.title}
                            fill
                            sizes="64px"
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
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[15px] font-sans truncate font-normal">
                          {item.product.title}
                        </h4>
                        <p className="text-[13px] text-midnight-ink font-mono mt-[6px] uppercase">
                          Talle {item.product.size || "Único"}
                        </p>
                        <p className="text-[15px] font-sans mt-[6px]">{formatPrice(item.product.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-midnight-ink pt-[18px] space-y-[13px] font-sans text-[15px]">
                  <div className="flex justify-between gap-[13px] text-midnight-ink">
                    <span>Subtotal</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between gap-[13px] text-midnight-ink">
                    <span>Envío (Correo Argentino)</span>
                    <span>{formatPrice(SHIPPING_FEE)}</span>
                  </div>

                  <div className="flex justify-between gap-[13px] font-normal text-[20px] pt-[13px] border-t border-midnight-ink">
                    <span>Total</span>
                    <span>{formatPrice(totalPrice + SHIPPING_FEE)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
