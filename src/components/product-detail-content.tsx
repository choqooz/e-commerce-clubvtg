"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CartDrawer } from "@/components/cart-drawer";
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TryOnSection } from "@/components/try-on-section";
import { useCart } from "@/contexts/cart-context";
import { productViewedEvent } from "@/lib/analytics-events";
import { formatPrice } from "@/lib/config";
import { COLOR_MAP } from "@/lib/constants";
import type { Product } from "@/lib/types";

export function ProductDetailContent({
  product,
  relatedProducts,
}: {
  product: Product;
  relatedProducts: Product[];
}) {
  const { addItem } = useCart();
  const posthog = usePostHog();
  const [activeImage, setActiveImage] = useState<string | null>(
    product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : null,
  );

  useEffect(() => {
    const event = productViewedEvent(product);
    posthog?.capture(event.event, event.properties);
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddToCart = () => {
    if (product.status !== "available") {
      toast.error("Este producto ya no está disponible");
      return;
    }
    addItem(product);
    toast.success("Agregado al carrito");
  };

  return (
    <div className="min-h-screen bg-bone-white font-sans font-normal text-midnight-ink">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="px-[18px] py-[18px] md:px-[24px]">
          <nav className="flex flex-wrap items-center gap-[6px] font-mono text-[13px] leading-[1.3]">
            <Link
              href="/"
              className="hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <Link
              href={`/?category=${product.category}`}
              className="capitalize hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              {product.category}
            </Link>
            {product.subcategory && (
              <>
                <ChevronRight size={12} />
                <span className="capitalize">{product.subcategory}</span>
              </>
            )}
            <ChevronRight size={12} />
            <span className="break-words text-midnight-ink">{product.title}</span>
          </nav>
        </div>

        <div className="pb-[42px]">
          <div className="grid grid-cols-1 gap-[0px] lg:grid-cols-2">
            {/* Product Images Gallery */}
            <div className="relative min-w-0 space-y-[13px]">
              <div className="relative flex aspect-4/5 max-h-[600px] w-full items-center justify-center overflow-hidden bg-warm-sand lg:max-h-[700px]">
                {activeImage ? (
                  <Image
                    src={activeImage}
                    alt={product.title}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain"
                  />
                ) : (
                  <span className="font-mono text-[13px] font-normal uppercase text-midnight-ink">
                    {product.category}
                  </span>
                )}
              </div>

              {/* Thumbnails */}
              {product.image_urls && product.image_urls.length > 1 && (
                <div className="grid grid-cols-5 gap-[0px]">
                  {product.image_urls.map((url: string, i: number) => (
                    <button
                      key={url}
                      onClick={() => setActiveImage(url)}
                      className={`relative aspect-4/5 overflow-hidden border bg-warm-sand focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink ${
                        activeImage === url
                          ? "border-midnight-ink"
                          : "border-transparent hover:border-midnight-ink"
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`Vista ${i + 1}`}
                        fill
                        sizes="10vw"
                        className="object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}

              {product.status === "sold" && (
                <span className="absolute top-[18px] right-[18px] border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase text-midnight-ink">
                  Vendido
                </span>
              )}
              {product.status === "reserved" && (
                <span className="absolute top-[18px] right-[18px] border border-midnight-ink bg-warm-sand px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase text-midnight-ink">
                  Reservado
                </span>
              )}
            </div>

            {/* Product Info */}
            <div className="flex min-w-0 flex-col justify-center px-[18px] py-[42px] md:px-[24px] lg:px-[42px]">
              <h1 className="mb-[13px] break-words font-sans text-[30px] leading-none font-normal">
                {product.title}
              </h1>

              <div className="mb-[24px] flex flex-wrap items-center gap-[13px]">
                {product.promotion_percent ? (
                  <span className="text-[15px] line-through">{formatPrice(product.price)}</span>
                ) : null}
                <span className="font-sans text-[20px] leading-[1.3]">
                  {formatPrice(product.current_price ?? product.price)}
                </span>
                {product.promotion_percent && product.promotion_ends_at ? (
                  <span className="font-mono text-[13px] font-normal">
                    -{product.promotion_percent}% hasta{" "}
                    {new Intl.DateTimeFormat("es-AR", {
                      dateStyle: "short",
                      hourCycle: "h23",
                      timeStyle: "medium",
                      timeZone: "America/Argentina/Buenos_Aires",
                    }).format(new Date(product.promotion_ends_at))}
                  </span>
                ) : null}
              </div>

              <p className="mb-[30px] whitespace-pre-wrap font-sans text-[15px] leading-[1.3]">
                {product.description}
              </p>

              {/* Color */}
              {product.color && (
                <div className="mb-[24px]">
                  <span className="mb-[13px] block font-mono text-[13px] font-normal uppercase">
                    Color
                  </span>
                  <div className="flex flex-wrap items-center gap-[13px]">
                    {product.color.split(",").map((c: string) => {
                      const colorName = c.trim();
                      const hex = COLOR_MAP[colorName.toLowerCase()] || "#cccccc";
                      return (
                        <div
                          key={colorName}
                          className="group relative h-[24px] w-[24px] cursor-help border border-midnight-ink"
                          style={
                            hex.includes("gradient")
                              ? { background: hex }
                              : { backgroundColor: hex }
                          }
                          aria-label={colorName}
                        >
                          {/* Tooltip */}
                          <div className="pointer-events-none absolute -top-[28px] left-1/2 -translate-x-1/2 whitespace-nowrap border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-mono text-[13px] font-normal capitalize text-midnight-ink opacity-0 group-hover:opacity-100">
                            {colorName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size */}
              {product.size && (
                <div className="mb-[30px]">
                  <span className="mb-[13px] block font-mono text-[13px] font-normal uppercase">
                    Talle
                  </span>
                  <div className="flex flex-wrap gap-[13px]">
                    <span className="flex min-h-[28px] min-w-[44px] items-center justify-center border border-midnight-ink bg-warm-sand px-[6px] py-[2px] font-mono text-[13px] font-normal">
                      {product.size}
                    </span>
                  </div>
                  <p className="mt-[6px] font-mono text-[13px] leading-[1.3]">
                    Pieza única — talle único
                  </p>
                </div>
              )}

              {/* Add to Cart */}
              <button
                onClick={handleAddToCart}
                disabled={product.status !== "available"}
                className={`mb-[6px] min-h-[36px] w-full border border-midnight-ink px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink ${
                  product.status === "available"
                    ? "bg-midnight-ink text-bone-white hover:underline underline-offset-4"
                    : "cursor-not-allowed bg-warm-sand text-midnight-ink"
                }`}
              >
                {product.status === "available"
                  ? "Agregar al carrito"
                  : product.status === "reserved"
                    ? "Reservado"
                    : product.status === "sold"
                      ? "Vendido"
                      : "No Disponible"}
              </button>

              <p className="mb-[18px] text-center font-mono text-[13px] leading-[1.3]">
                Envío a todo el país · Correo Argentino
              </p>

              {/* Details */}
              {(product.brand || product.condition || product.measurements) && (
                <div className="mt-[18px] border-t border-midnight-ink pt-[24px]">
                  <h3 className="mb-[13px] font-mono text-[13px] font-normal uppercase">
                    Detalles Adicionales
                  </h3>
                  <ul className="space-y-[6px] [&_strong]:font-normal">
                    {product.brand && (
                      <li className="flex items-start gap-[6px] font-sans text-[15px] leading-[1.3]">
                        <span className="mt-[6px] h-[4px] w-[4px] shrink-0 bg-midnight-ink" />
                        <strong>Marca:</strong> {product.brand}
                      </li>
                    )}
                    {product.condition && (
                      <li className="flex items-start gap-[6px] font-sans text-[15px] leading-[1.3]">
                        <span className="mt-[6px] h-[4px] w-[4px] shrink-0 bg-midnight-ink" />
                        <strong>Estado:</strong> {product.condition}
                      </li>
                    )}
                    {product.measurements && (
                      <li className="flex items-start gap-[6px] font-sans text-[15px] leading-[1.3]">
                        <span className="mt-[6px] h-[4px] w-[4px] shrink-0 bg-midnight-ink" />
                        <strong>Medidas:</strong> {product.measurements}
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Virtual Try-On */}
              <TryOnSection productSlug={product.slug} />
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="pb-[42px]">
            <h2 className="mb-[24px] px-[18px] font-sans text-[30px] leading-none font-normal md:px-[24px]">
              También te puede gustar
            </h2>
            <div className="grid grid-cols-2 gap-x-[0px] gap-y-[42px] md:grid-cols-4">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
