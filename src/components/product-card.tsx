import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const currentPrice = product.current_price ?? product.price;
  const promotionEnd =
    product.promotion_ends_at &&
    new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      hourCycle: "h23",
      timeStyle: "medium",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(product.promotion_ends_at));
  return (
    <Link
      href={`/product/${product.slug}`}
      className="product-card rounded-none bg-bone-white font-sans text-[15px] font-normal text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-[2px]"
    >
      <div className="relative overflow-hidden">
        {/* Product image */}
        <div className="relative flex w-full aspect-[4/5] items-center justify-center object-cover bg-secondary">
          {product.image_urls && product.image_urls.length > 0 ? (
            <Image
              src={product.image_urls[0]}
              alt={product.title}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <span className="font-mono text-[13px] font-normal uppercase text-midnight-ink">
              {product.category}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <h3 className="mt-[13px] font-sans text-[15px] font-normal leading-[1.2]">{product.title}</h3>
      <div className="mt-[6px] flex flex-wrap items-center gap-[6px] font-mono text-[13px] font-normal">
        {product.promotion_percent ? (
          <span className="line-through">{formatPrice(product.price)}</span>
        ) : null}
        <span>{formatPrice(currentPrice)}</span>
        {product.promotion_percent ? (
          <span className="rounded-none border border-midnight-ink bg-warm-sand px-[6px] py-[2px]">
            -{product.promotion_percent}%
          </span>
        ) : null}
      </div>
      {promotionEnd ? (
        <span className="mt-[6px] block font-mono text-[13px] font-normal">
          Hasta {promotionEnd}
        </span>
      ) : null}

      {/* Color + size */}
      <div className="mt-[13px] flex items-center gap-[6px]">
        <span className="font-mono text-[13px] font-normal">
          {product.size ? `Talle ${product.size}` : "Talle Único"}
          {product.color ? ` • ${product.color}` : ""}
        </span>
      </div>
    </Link>
  );
}
