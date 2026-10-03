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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
        {/* Original */}
        <div>
          <p className="text-[13px] text-midnight-ink mb-[6px] font-mono font-normal break-words">
            Tu foto
          </p>
          <div className="relative aspect-[3/4] w-full max-h-[450px] overflow-hidden rounded-none bg-warm-sand">
            <Image
              src={originalImageUrl}
              alt="Foto original"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>

        {/* Result — clickable for zoom */}
        <div>
          <p className="text-[13px] text-midnight-ink mb-[6px] font-mono font-normal break-words">
            Probándote: {productTitle}
          </p>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="group relative aspect-[3/4] w-full max-h-[450px] overflow-hidden rounded-none bg-warm-sand cursor-zoom-in focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            aria-label={`Ampliar resultado: ${productTitle}`}
          >
            <Image
              src={resultImageUrl}
              alt={`Resultado probándote ${productTitle}`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
            {/* Hover hint overlay */}
            <div className="absolute bottom-[6px] left-[6px] right-[6px] flex items-center justify-end">
              <span className="flex items-center gap-[6px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[13px] font-mono font-normal text-midnight-ink">
                <ZoomIn size={14} strokeWidth={1.5} />
                Click para ampliar
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Download link */}
      <div className="flex justify-end">
        <a
          href={resultImageUrl}
          download={`clubvtg-tryon-${productTitle.toLowerCase().replace(/\s+/g, "-")}.jpg`}
          className={cn(
            "inline-flex min-h-[36px] items-center gap-[6px] text-[13px] font-mono font-normal",
            "text-midnight-ink hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2",
          )}
        >
          <Download size={14} strokeWidth={1.5} />
          Descargar resultado
        </a>
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
