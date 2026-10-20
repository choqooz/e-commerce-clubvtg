import Image from "next/image";
import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

export function CollectionEditorial({
  products,
  categoryName,
  query,
}: {
  products: Product[];
  categoryName: string;
  query: string;
}) {
  const heading = query ? `Búsqueda: “${query}”` : categoryName;
  // The cover is decorative: it never consumes a card or changes product order.
  const cover = products
    .flatMap((product) => product.image_urls)
    .map((url) => url.trim())
    .find((url) => {
      if (!url || /\s/.test(url)) return false;
      if (url.startsWith("/") && !url.startsWith("//")) return true;
      try {
        return new URL(url).protocol === "https:";
      } catch {
        return false;
      }
    });

  return (
    <div className="grid grid-cols-1 items-start gap-[10px] pb-[42px] lg:grid-cols-2">
      {cover && products.length > 0 && (
        <div
          data-collection-hero
          aria-hidden="true"
          className={`relative aspect-[4/5] min-w-0 overflow-hidden bg-secondary lg:sticky lg:top-[156px] ${
            products.length === 1 ? "lg:aspect-[4/3]" : "lg:aspect-[2/3]"
          }`}
        >
          <Image
            src={cover}
            alt=""
            fill
            preload
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-x-0 top-[55%] px-[24px] text-center text-white lg:px-[42px]">
            <span className="break-words font-sans text-[42px] leading-[1.1] md:text-[60px] lg:text-[72px]">
              {heading}
            </span>
          </div>
        </div>
      )}
      <div
        data-collection-products
        className={`grid min-w-0 grid-cols-2 items-start gap-x-[10px] gap-y-[24px] ${!cover ? "lg:col-span-2 lg:grid-cols-4" : ""}`}
      >
        <header
          className={`col-span-2 flex min-w-0 flex-col justify-center gap-[24px] px-[18px] py-[30px] lg:col-span-1 ${
            cover && products.length > 0 ? "lg:aspect-[4/5] lg:px-[30px]" : ""
          }`}
        >
          <h1 className="break-words font-sans text-[30px] leading-[1.1] font-normal lg:text-[36px]">
            {heading}
          </h1>
          <p className="max-w-[32ch] font-sans text-[15px] leading-[1.5]">
            {query
              ? `Prendas que coinciden con tu búsqueda${categoryName === "Todas las prendas" ? "." : ` en ${categoryName}.`}`
              : categoryName === "Todas las prendas"
                ? "Explorá las prendas del catálogo. Consultá el talle, el precio y el estado en cada ficha."
                : `Explorá ${categoryName}. Consultá el talle, el precio y el estado en cada ficha.`}
          </p>
        </header>
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} priority={index === 0} />
        ))}
      </div>
    </div>
  );
}
