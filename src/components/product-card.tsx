import { ProgressiveImage } from "@/components/progressive-image";
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
      className="product-card block min-w-0 rounded-none bg-bone-white font-sans text-[15px] font-normal text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-[2px]"
    >
      <div className="relative overflow-hidden">
        {/* Product image */}
        <div className="relative flex w-full aspect-[4/5] items-center justify-center object-cover bg-secondary">
          {product.image_urls && product.image_urls.length > 0 ? (
            <ProgressiveImage
              src={product.image_urls[0]}
              alt={product.title}
              fill
              preload={priority}
              sizes="(min-width: 1024px) 25vw, 50vw"
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
      <div className="mt-[13px] flex items-baseline justify-between gap-[13px] px-[13px] font-sans text-[15px] leading-[1.2]">
        <h3 className="min-w-0 break-words font-normal underline underline-offset-2">
          {product.title}
        </h3>
        <div className="flex shrink-0 flex-col items-end gap-[6px]">
          {product.promotion_percent ? (
            <span className="text-[13px] line-through">{formatPrice(product.price)}</span>
          ) : null}
          <span className="whitespace-nowrap">{formatPrice(currentPrice)}</span>
          {product.promotion_percent ? (
            <span className="font-mono text-[13px]">-{product.promotion_percent}%</span>
          ) : null}
        </div>
      </div>
      {promotionEnd ? (
        <span className="mt-[6px] block px-[13px] font-mono text-[13px] font-normal text-foreground/65">
          Hasta {promotionEnd}
        </span>
      ) : null}

      {/* Color + size */}
      <div className="mt-[6px] flex flex-wrap items-center justify-center gap-[6px] px-[13px] text-center text-foreground/65">
        <span className="font-mono text-[13px] font-normal">
          {product.size ? `Talle ${product.size}` : "Talle Único"}
          {product.color ? ` • ${product.color}` : ""}
        </span>
      </div>
      {product.status !== "available" && (
        <p className="mt-[6px] px-[13px] font-mono text-[13px] font-normal">
          {{ reserved: "Reservado", sold: "Vendido", archived: "No disponible" }[product.status]}
        </p>
      )}
    </Link>
  );
}
