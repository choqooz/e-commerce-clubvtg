import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const currentPrice = product.current_price ?? product.price;
  const promotionEnd = product.promotion_ends_at && new Intl.DateTimeFormat("es-AR", { dateStyle: "short", hourCycle: "h23", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(product.promotion_ends_at));
  return (
    <Link
      href={`/product/${product.slug}`}
      className="product-card group transition-shadow duration-200 hover:shadow-md"
    >
      <div className="relative overflow-hidden">
        {/* Product image */}
        <div className="product-card-image bg-secondary flex items-center justify-center relative">
          {product.image_urls && product.image_urls.length > 0 ? (
            <Image
              src={product.image_urls[0]}
              alt={product.title}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="text-muted-foreground/40 text-xs uppercase tracking-widest font-sans">
              {product.category}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <h3 className="product-card-title mt-3">{product.title}</h3>
      <div className="flex items-center gap-2 mt-1">
        {product.promotion_percent ? <span className="text-xs text-muted-foreground line-through">{formatPrice(product.price)}</span> : null}
        <span className="product-card-price">{formatPrice(currentPrice)}</span>
        {product.promotion_percent ? <span className="text-xs font-medium text-green-700">-{product.promotion_percent}%</span> : null}
      </div>
      {promotionEnd ? <span className="text-xs text-muted-foreground">Hasta {promotionEnd}</span> : null}

      {/* Color + size */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-muted-foreground">
          {product.size ? `Talle ${product.size}` : "Talle Único"}
          {product.color ? ` • ${product.color}` : ""}
        </span>
      </div>
    </Link>
  );
}
