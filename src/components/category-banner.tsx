import Image from "next/image";
import { useState } from "react";
import { CATEGORIES, type Category } from "@/lib/config";
import type { Product } from "@/lib/types";

type EntryCategory = Exclude<Category, "all">;

const ILLUSTRATIVE_COVER = "/glein-entry/clothing.jpg";
const COVER_SOURCE =
  "https://commons.wikimedia.org/wiki/File:2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg";
const COVER_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";

const ENTRY_ORDER: EntryCategory[] = [
  "tops",
  "outerwear",
  "accessories",
  "footwear",
  "bottoms",
  "knitwear",
];

const TILE_LAYOUT: Record<EntryCategory, { spans: string; sizes: string; position: string }> = {
  tops: {
    spans: "col-span-2 md:col-start-1 md:row-start-1",
    sizes: "(min-width: 768px) 50vw, 100vw",
    position: "50% 35%",
  },
  outerwear: {
    spans: "col-span-2 row-span-2 md:col-start-3 md:row-start-1",
    sizes: "(min-width: 768px) 50vw, 100vw",
    position: "35% 50%",
  },
  accessories: {
    spans: "md:col-start-1 md:row-start-2",
    sizes: "(min-width: 768px) 25vw, 50vw",
    position: "50% 25%",
  },
  footwear: {
    spans: "md:col-start-2 md:row-start-2",
    sizes: "(min-width: 768px) 25vw, 50vw",
    position: "50% 75%",
  },
  bottoms: {
    spans: "col-span-2 row-span-2 md:col-start-1 md:row-start-3",
    sizes: "(min-width: 768px) 50vw, 100vw",
    position: "50% 65%",
  },
  knitwear: {
    spans: "col-span-2 row-span-2 md:col-start-3 md:row-start-3",
    sizes: "(min-width: 768px) 50vw, 100vw",
    position: "65% 50%",
  },
};

function usableImage(source: string): boolean {
  if (!source || /\s/.test(source)) return false;
  if (source.startsWith("/") && !source.startsWith("//")) return true;
  try {
    return new URL(source).protocol === "https:";
  } catch {
    return false;
  }
}

function productCover(product: Product): string | undefined {
  if (product.status !== "available") return;
  return product.image_urls.map((image) => image.trim()).find(usableImage);
}

function entryCovers(products: Product[]) {
  const photos = products.flatMap((product) => {
    const source = productCover(product);
    return source ? [{ category: product.category, source }] : [];
  });
  const matching = ENTRY_ORDER.map((category) =>
    photos.find((photo) => photo.category === category),
  );
  const used = new Set(matching.flatMap((photo) => (photo ? [photo.source] : [])));
  const pool = [...new Set(photos.map((photo) => photo.source))];
  let fallbackIndex = 0;
  return matching.map((photo) => {
    if (photo) return { cover: photo.source, illustrative: false };
    // Use distinct initial-product photos before repeating any. Covers never change taxonomy.
    const unusedCover = pool.find((source) => !used.has(source));
    const cover = unusedCover ?? (pool.length ? pool[fallbackIndex++ % pool.length] : undefined);
    if (cover) used.add(cover);
    return { cover: cover ?? ILLUSTRATIVE_COVER, illustrative: true };
  });
}

function CategoryTile({
  category,
  label,
  cover,
  illustrative,
  onCategoryChange,
}: {
  category: EntryCategory;
  label: string;
  cover: string;
  illustrative: boolean;
  onCategoryChange: (category: Category) => void;
}) {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const source = cover !== failedCover ? cover : undefined;
  const layout = TILE_LAYOUT[category];

  return (
    <button
      type="button"
      aria-label={`Ver ${label} en el catálogo`}
      aria-controls="catalog"
      onClick={() => onCategoryChange(category)}
      className={`group relative flex min-w-0 items-center justify-center overflow-hidden rounded-none bg-warm-sand p-[13px] text-center font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-[6px] focus-visible:outline-midnight-ink ${layout.spans}`}
    >
      {source && (
        <Image
          src={source}
          alt=""
          fill
          sizes={layout.sizes}
          unoptimized={source.startsWith("https://")}
          className="object-cover"
          style={{ objectPosition: layout.position }}
          onError={() => setFailedCover(source)}
        />
      )}
      <span
        className={`relative flex w-max max-w-full min-w-0 flex-col items-center gap-[6px] py-[6px] group-focus-visible:outline-2 group-focus-visible:outline-solid group-focus-visible:-outline-offset-2 ${
          source
            ? "text-bone-white group-focus-visible:outline-bone-white"
            : "text-midnight-ink group-focus-visible:outline-midnight-ink"
        }`}
      >
        <span className="relative block max-w-full break-words font-sans text-[24px] font-normal leading-none md:text-[30px]">
          {label}
        </span>
        {source && (
          <span className="relative block font-mono text-[13px] font-normal leading-[1.2] underline underline-offset-4">
            Ver colección
          </span>
        )}
      </span>
      {(illustrative || !source) && (
        <span
          className={`absolute bottom-[13px] left-[13px] max-w-[calc(100%-26px)] px-[6px] py-[6px] text-left font-mono text-[13px] font-normal leading-[1.2] ${source ? "text-bone-white" : "text-midnight-ink"}`}
        >
          <span className="relative">
            {!source
              ? "Imagen no disponible"
              : cover === ILLUSTRATIVE_COVER
                ? "Imagen ilustrativa"
                : "Imagen ilustrativa · otra categoría"}
          </span>
        </span>
      )}
    </button>
  );
}

export function CategoryBanner({
  initialProducts,
  onCategoryChange,
}: {
  initialProducts: Product[];
  onCategoryChange: (category: Category) => void;
}) {
  const covers = entryCovers(initialProducts);
  const categories = ENTRY_ORDER.map((id, index) => ({
    id,
    label: CATEGORIES.find((category) => category.id === id)!.label,
    ...covers[index],
  }));
  const hasLicensedCover = categories.some((category) => category.cover === ILLUSTRATIVE_COVER);

  return (
    <div className="w-full">
      <div className="grid w-full min-w-0 grid-cols-2 auto-rows-[62.5vw] gap-[10px] md:grid-cols-4 md:auto-rows-[31.25vw]">
        {categories.map((category) => (
          <CategoryTile
            key={category.id}
            category={category.id}
            label={category.label}
            cover={category.cover}
            illustrative={category.illustrative}
            onCategoryChange={onCategoryChange}
          />
        ))}
      </div>
      {hasLicensedCover && (
        <p className="px-[18px] pt-[13px] font-mono text-[13px] font-normal leading-[1.2] text-midnight-ink md:px-[24px]">
          Foto ilustrativa:{" "}
          <a
            href={COVER_SOURCE}
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink"
          >
            Rico Shen / Wikimedia Commons
          </a>
          {" · "}
          <a
            href={COVER_LICENSE}
            rel="license"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink"
          >
            CC BY-SA 4.0
          </a>
          {" · Recortes de encuadre."}
        </p>
      )}
    </div>
  );
}
