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
          <nav
            aria-label="Ruta del producto"
            className="flex flex-wrap items-center gap-[6px] font-mono text-[13px] leading-[1.3]"
          >
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <Link
              href={`/?category=${product.category}`}
              className="inline-flex min-h-[44px] items-center capitalize hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
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

        <div className="pb-[42px] md:pb-[72px]">
          <div className="grid grid-cols-1 items-start gap-[0px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            {/* The portrait field leads the spread; the index stays compact at every width. */}
            <div className="relative min-w-0" role="group" aria-label="Galería del producto">
              <div
                id="product-active-image"
                className="relative flex aspect-4/5 w-full items-center justify-center overflow-hidden bg-warm-sand sm:aspect-square lg:aspect-4/5"
              >
                {activeImage ? (
                  <Image
                    src={activeImage}
                    alt={product.title}
                    fill
                    preload
                    sizes="(min-width: 1024px) 58.33vw, 100vw"
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
                <div className="flex gap-[6px] overflow-x-auto px-[18px] py-[18px] md:px-[24px]">
                  {product.image_urls.map((url: string, i: number) => (
                    <button
                      key={url}
                      type="button"
                      aria-label={`Ver vista ${i + 1} de ${product.title}`}
                      aria-pressed={activeImage === url}
                      aria-controls="product-active-image"
                      onClick={() => setActiveImage(url)}
                      className={`relative aspect-4/5 w-[72px] shrink-0 overflow-hidden border bg-warm-sand md:w-[84px] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink ${
                        activeImage === url
                          ? "border-midnight-ink"
                          : "border-transparent hover:border-midnight-ink"
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`Vista ${i + 1}`}
                        fill
                        sizes="(min-width: 768px) 84px, 72px"
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
            <div className="min-w-0 px-[18px] py-[30px] md:px-[24px] md:py-[42px] lg:px-[42px] lg:py-[36px]">
              <header className="border-b border-midnight-ink pb-[24px] md:pb-[30px]">
                <h1 className="mb-[24px] break-words font-sans text-[36px] leading-[1.1] font-normal lg:text-[48px]">
                  {product.title}
                </h1>

                <div className="flex flex-wrap items-baseline gap-x-[13px] gap-y-[6px]">
                  {product.promotion_percent ? (
                    <span className="text-[15px] line-through">{formatPrice(product.price)}</span>
                  ) : null}
                  <span className="font-sans text-[30px] leading-[1.2]">
                    {formatPrice(product.current_price ?? product.price)}
                  </span>
                  {product.promotion_percent && product.promotion_ends_at ? (
                    <span className="w-full font-mono text-[13px] leading-[1.5] font-normal">
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
              </header>

              <p className="my-[24px] max-w-[42ch] whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.6] md:my-[30px]">
                {product.description}
              </p>

              <div className="grid grid-cols-1 gap-[24px] pb-[30px] sm:grid-cols-2">
                {/* Color */}
                {product.color && (
                  <div className="min-w-0">
                    <span className="mb-[13px] block font-mono text-[13px] font-normal uppercase">
                      Color
                    </span>
                    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[6px]">
                      {product.color.split(",").map((c: string) => {
                        const colorName = c.trim();
                        const hex = COLOR_MAP[colorName.toLowerCase()] || "#cccccc";
                        return (
                          <div key={colorName} className="flex min-w-0 items-center gap-[6px]">
                            <span
                              className="h-[18px] w-[18px] shrink-0 border border-midnight-ink"
                              style={
                                hex.includes("gradient")
                                  ? { background: hex }
                                  : { backgroundColor: hex }
                              }
                              aria-label={colorName}
                            />
                            <span className="break-words font-mono text-[13px] capitalize leading-[1.5]">
                              {colorName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Size */}
                {product.size && (
                  <div className="min-w-0">
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
              </div>

              {/* Keep purchase and shipping together, distinct from descriptive metadata. */}
              <div className="border-t border-midnight-ink pt-[24px]">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={product.status !== "available"}
                  className={`mb-[13px] min-h-[48px] w-full border border-midnight-ink px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink ${
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

                <p className="text-center font-mono text-[13px] leading-[1.5]">
                  Envío a todo el país · Correo Argentino
                </p>
              </div>

              {/* Details */}
              {(product.brand || product.condition || product.measurements) && (
                <section className="mt-[30px] border-t border-midnight-ink pt-[24px]">
                  <h2 className="mb-[18px] font-mono text-[13px] font-normal uppercase">
                    Detalles Adicionales
                  </h2>
                  <ul className="space-y-[13px] [&_strong]:font-mono [&_strong]:text-[13px] [&_strong]:font-normal">
                    {product.brand && (
                      <li className="grid grid-cols-[84px_minmax(0,1fr)] gap-[13px] break-words font-sans text-[15px] leading-[1.5]">
                        <strong>Marca:</strong> {product.brand}
                      </li>
                    )}
                    {product.condition && (
                      <li className="grid grid-cols-[84px_minmax(0,1fr)] gap-[13px] break-words font-sans text-[15px] leading-[1.5]">
                        <strong>Estado:</strong> {product.condition}
                      </li>
                    )}
                    {product.measurements && (
                      <li className="grid grid-cols-[84px_minmax(0,1fr)] gap-[13px] break-words font-sans text-[15px] leading-[1.5]">
                        <strong>Medidas:</strong> {product.measurements}
                      </li>
                    )}
                  </ul>
                </section>
              )}

              {/* Virtual Try-On */}
              <div className="mt-[30px]">
                <TryOnSection productSlug={product.slug} />
              </div>
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="border-t border-midnight-ink pb-[42px] md:pb-[72px]">
            <h2 className="px-[18px] py-[30px] font-sans text-[30px] leading-[1.2] font-normal md:px-[24px] md:py-[42px] md:text-[36px]">
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
