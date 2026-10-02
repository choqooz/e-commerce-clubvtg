"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TryOnHistoryItem } from "@/lib/actions/credits";
import type { TryOnStatus } from "@/lib/types";

interface TryOnHistoryProps {
  items: TryOnHistoryItem[];
}

function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const STATUS_CONFIG: Record<TryOnStatus, { label: string; className: string }> = {
  completed: {
    label: "Completado",
    className: "border-midnight-ink bg-bone-white text-midnight-ink",
  },
  failed: {
    label: "Fallido",
    className: "border-midnight-ink border-dotted bg-bone-white text-midnight-ink",
  },
  processing: {
    label: "Procesando",
    className: "border-midnight-ink bg-warm-sand text-midnight-ink",
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ImagePlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-[13px] font-mono font-normal text-midnight-ink">
      Sin imagen
    </div>
  );
}

function HistoryThumbnail({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  if (!isValidImageUrl(src) || failed) {
    return <ImagePlaceholder />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      onError={handleError}
    />
  );
}

export function TryOnHistory({ items }: TryOnHistoryProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-[42px] space-y-[18px] font-sans text-[15px] font-normal">
        <p className="text-midnight-ink">Aún no probaste ninguna prenda</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Explorar el catálogo</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[18px] text-midnight-ink font-normal">
      {items.map((item) => {
        const imageUrl =
          item.status === "completed" && item.result_image_url
            ? item.result_image_url
            : item.product_image;

        const config = STATUS_CONFIG[item.status];

        return (
          <div key={item.id} className="group min-w-0 space-y-[6px]">
            {/* Thumbnail */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-none bg-warm-sand">
              <HistoryThumbnail src={imageUrl} alt={`Prueba: ${item.product_title}`} />

              {/* Status badge overlay */}
              <div className="absolute top-[6px] left-[6px] right-[6px]">
                <Badge variant="outline" className={config.className}>
                  {config.label}
                </Badge>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-[6px]">
              <p className="text-[15px] font-sans font-normal leading-[1.3] break-words line-clamp-1">
                {item.product_title}
              </p>
              <p className="text-[13px] font-mono font-normal text-midnight-ink leading-[1.2]">
                {formatDate(item.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
