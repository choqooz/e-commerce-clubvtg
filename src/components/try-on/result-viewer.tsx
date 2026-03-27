"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageZoomModal } from "@/components/try-on/image-zoom-modal";

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
    <div className="space-y-4">
      {/* Side-by-side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Original */}
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 font-sans">
            Tu foto
          </p>
          <div className="relative aspect-[3/4] w-full max-h-[450px] overflow-hidden border border-border bg-secondary">
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
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 font-sans">
            Probándote: {productTitle}
          </p>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="group relative aspect-[3/4] w-full max-h-[450px] overflow-hidden border border-border bg-secondary cursor-zoom-in"
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
              <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-sans text-white opacity-0 transition-opacity group-hover:opacity-100">
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
            "inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-sans",
            "text-foreground/70 hover:text-foreground transition-colors",
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
