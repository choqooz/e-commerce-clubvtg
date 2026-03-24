import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.slug}`} className="product-card group">
      <div className="relative overflow-hidden">
        {/* Product image */}
        <div className="product-card-image bg-secondary flex items-center justify-center relative">
          {product.image_urls && product.image_urls.length > 0 ? (
            <Image
              src={product.image_urls[0]}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
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
        <span className="product-card-price">{formatPrice(product.price)}</span>
      </div>

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
