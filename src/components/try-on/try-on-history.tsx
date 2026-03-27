"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

const STATUS_CONFIG: Record<
  TryOnStatus,
  { label: string; className: string }
> = {
  completed: {
    label: "Completado",
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  failed: {
    label: "Fallido",
    className: "bg-red-500/10 text-red-700 dark:text-red-400",
  },
  processing: {
    label: "Procesando",
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
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
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Sin imagen
    </div>
  );
}

function HistoryThumbnail({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
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
      className="object-cover transition-transform group-hover:scale-105"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      onError={handleError}
    />
  );
}

export function TryOnHistory({ items }: TryOnHistoryProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">
          Aún no probaste ninguna prenda
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Explorar el catálogo</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const imageUrl =
          item.status === "completed" && item.result_image_url
            ? item.result_image_url
            : item.product_image;

        const config = STATUS_CONFIG[item.status];

        return (
          <div key={item.id} className="group space-y-2">
            {/* Thumbnail */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
              <HistoryThumbnail
                src={imageUrl}
                alt={`Prueba: ${item.product_title}`}
              />

              {/* Status badge overlay */}
              <div className="absolute top-2 left-2">
                <Badge variant="outline" className={config.className}>
                  {config.label}
                </Badge>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight line-clamp-1">
                {item.product_title}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(item.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
