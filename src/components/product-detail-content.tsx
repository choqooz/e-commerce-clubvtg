"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import ProductCard from "@/components/product-card";
import TryOnSection from "@/components/try-on-section";
import CartDrawer from "@/components/cart-drawer";
import { useCart } from "@/contexts/cart-context";
import { formatPrice } from "@/lib/config";
import { COLOR_MAP } from "@/lib/constants";
import type { Product } from "@/lib/types";

export function ProductDetailContent({ 
  product, 
  relatedProducts 
}: { 
  product: Product;
  relatedProducts: Product[];
}) {
  const { addItem } = useCart();
  const [activeImage, setActiveImage] = useState<string | null>(
    product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : null
  );
  
  const handleAddToCart = () => {
    if (product.status !== "available") {
      toast.error("Este producto ya no está disponible");
      return;
    }
    addItem(product);
    toast.success("Agregado al carrito");
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
            <Link
              href="/"
              className="hover:text-foreground transition-colors"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <Link
              href={`/?category=${product.category}`}
              className="hover:text-foreground transition-colors capitalize"
            >
              {product.category}
            </Link>
            {product.subcategory && (
              <>
                <ChevronRight size={12} />
                <span className="hover:text-foreground transition-colors capitalize">
                  {product.subcategory}
                </span>
              </>
            )}
            <ChevronRight size={12} />
            <span className="text-foreground">{product.title}</span>
          </nav>
        </div>

        <div className="container mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Product Images Gallery */}
            <div className="relative space-y-4">
              <div className="relative w-full aspect-4/5 max-h-[600px] lg:max-h-[700px] bg-secondary flex items-center justify-center overflow-hidden">
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
                  <span className="text-muted-foreground/30 text-lg uppercase tracking-widest font-sans">
                    {product.category}
                  </span>
                )}
              </div>
              
              {/* Thumbnails */}
              {product.image_urls && product.image_urls.length > 1 && (
                <div className="grid grid-cols-5 gap-3">
                  {product.image_urls.map((url: string, i: number) => (
                    <button
                      key={url}
                      onClick={() => setActiveImage(url)}
                      className={`relative aspect-4/5 bg-secondary overflow-hidden border-2 transition-all ${
                        activeImage === url ? 'border-primary opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`Vista ${i+1}`}
                        fill
                        sizes="10vw"
                        className="object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}
              
              {product.status === "sold" && (
                <span className="absolute top-4 right-4 bg-muted text-muted-foreground text-xs font-sans uppercase tracking-widest px-3 py-1 font-medium">Vendido</span>
              )}
            </div>

            {/* Product Info */}
            <div className="flex flex-col justify-center">
              <h1 className="font-heading text-3xl md:text-4xl font-light mb-3">
                {product.title}
              </h1>

              <div className="flex items-center gap-3 mb-6">
                <span className="text-lg font-sans">
                  {formatPrice(product.price)}
                </span>
                {/* Vintage items don't typically have "originalPrice", so removed */}
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-8 font-sans whitespace-pre-wrap">
                {product.description}
              </p>

              {/* Color */}
              {product.color && (
                <div className="mb-6">
                  <span className="text-xs uppercase tracking-widest font-sans font-medium mb-3 block">
                    Color
                  </span>
                  <div className="flex flex-wrap gap-2 items-center">
                    {product.color.split(",").map((c: string) => {
                      const colorName = c.trim();
                      const hex = COLOR_MAP[colorName.toLowerCase()] || "#cccccc";
                      return (
                        <div 
                          key={colorName} 
                          className="w-6 h-6 rounded-full border border-border/50 shadow-sm relative group cursor-help transition-transform hover:scale-110"
                          style={hex.includes("gradient") ? { background: hex } : { backgroundColor: hex }}
                          aria-label={colorName}
                        >
                          {/* Tooltip */}
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none capitalize">
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
                <div className="mb-8">
                  <span className="text-xs uppercase tracking-widest font-sans font-medium mb-3 block">
                    Talle
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <span className="min-w-[44px] h-10 px-3 border border-foreground bg-primary text-primary-foreground text-sm font-sans flex items-center justify-center">
                      {product.size}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-sans">
                    Pieza única — talle único
                  </p>
                </div>
              )}

              {/* Add to Cart */}
              <button
                onClick={handleAddToCart}
                disabled={product.status !== "available"}
                className={`w-full py-3.5 text-sm uppercase tracking-widest font-sans font-medium transition-opacity mb-2 ${
                  product.status === "available"
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {product.status === "available" ? "Agregar al carrito" : "No Disponible"}
              </button>

              <p className="text-xs text-muted-foreground text-center font-sans mb-4">
                Envío a todo el país · Correo Argentino
              </p>

              {/* Details */}
              {(product.brand || product.condition || product.measurements) && (
                <div className="border-t border-border pt-6 mt-4">
                  <h3 className="text-xs uppercase tracking-widest font-sans font-medium mb-3">
                    Detalles Adicionales
                  </h3>
                  <ul className="space-y-1.5">
                    {product.brand && (
                      <li className="text-sm text-muted-foreground font-sans flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                        <strong>Marca:</strong> {product.brand}
                      </li>
                    )}
                    {product.condition && (
                      <li className="text-sm text-muted-foreground font-sans flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                        <strong>Estado:</strong> {product.condition}
                      </li>
                    )}
                    {product.measurements && (
                      <li className="text-sm text-muted-foreground font-sans flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
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
          <section className="container mx-auto px-6 pb-16">
            <h2 className="section-title mb-6">También te puede gustar</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
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
