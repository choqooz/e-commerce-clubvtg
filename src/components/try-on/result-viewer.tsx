"use client";

import { Download, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { ImageZoomModal } from "@/components/try-on/image-zoom-modal";
import { cn } from "@/lib/utils";

interface ResultViewerProps {
  originalImageUrl: string;
  resultImageUrl: string;
  productTitle: string;
}

export function ResultViewer({
  originalImageUrl,
  resultImageUrl,
  productTitle,
}: ResultViewerProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className="space-y-[18px] text-midnight-ink font-normal">
      {/* Side-by-side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px] md:gap-[18px]">
        {/* Original */}
        <figure className="min-w-0">
          <figcaption className="min-h-[48px] border-t border-midnight-ink py-[13px] text-[13px] text-midnight-ink font-mono font-normal break-words">
            Tu foto
          </figcaption>
          <div className="relative aspect-[3/4] w-full max-h-[450px] overflow-hidden rounded-none bg-warm-sand">
            <Image
              src={originalImageUrl}
              alt="Foto original"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </figure>

        {/* Result — clickable for zoom */}
        <figure className="min-w-0">
          <figcaption className="min-h-[48px] border-t border-midnight-ink py-[13px] text-[13px] text-midnight-ink font-mono font-normal break-words">
            Probándote: {productTitle}
          </figcaption>
          <div className="relative aspect-[3/4] w-full max-h-[450px] overflow-hidden rounded-none bg-warm-sand">
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              className="absolute inset-0 min-h-[48px] min-w-[48px] w-full h-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:-outline-offset-2"
              aria-label={`Ampliar resultado: ${productTitle}`}
              title={`Ampliar resultado: ${productTitle}`}
            >
              <Image
                src={resultImageUrl}
                alt={`Resultado probándote ${productTitle}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <span
                aria-hidden="true"
                className="absolute bottom-[6px] right-[6px] inline-flex size-[48px] items-center justify-center rounded-none border border-midnight-ink bg-bone-white text-midnight-ink"
              >
                <ZoomIn size={14} strokeWidth={1.5} />
              </span>
            </button>
            {/* Sibling link stays above the image trigger without dispatching zoom. */}
            <a
              href={resultImageUrl}
              download={`clubvtg-tryon-${productTitle.toLowerCase().replace(/\s+/g, "-")}.jpg`}
              aria-label="Descargar resultado"
              title="Descargar resultado"
              className={cn(
                "absolute bottom-[6px] right-[60px] inline-flex size-[48px] items-center justify-center rounded-none border border-midnight-ink bg-bone-white",
                "text-midnight-ink hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2",
              )}
            >
              <Download size={14} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </div>
        </figure>
      </div>

      {/* Zoom lightbox */}
      <ImageZoomModal
        src={resultImageUrl}
        alt={`Resultado probándote ${productTitle}`}
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
      />
    </div>
  );
}
