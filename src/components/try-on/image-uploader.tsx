"use client";

import { Upload, Camera, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const MAX_PORTRAIT_W = 576;
const MAX_PORTRAIT_H = 1024;
const MAX_LANDSCAPE_W = 1024;
const MAX_LANDSCAPE_H = 576;

/**
 * Resizes an image file to fit within 576x1024 (portrait) or 1024x576 (landscape),
 * preserving aspect ratio and never upscaling. Exports as JPEG at quality 0.95.
 */
function resizeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { naturalWidth: srcW, naturalHeight: srcH } = img;
      const isPortrait = srcH >= srcW;

      const maxW = isPortrait ? MAX_PORTRAIT_W : MAX_LANDSCAPE_W;
      const maxH = isPortrait ? MAX_PORTRAIT_H : MAX_LANDSCAPE_H;

      // Scale down only — never upscale
      const scale = Math.min(1, maxW / srcW, maxH / srcH);
      const targetW = Math.round(srcW * scale);
      const targetH = Math.round(srcH * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas 2D context"));
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob returned null"));
            return;
          }
          resolve(new File([blob], "user-image.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.95,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for resizing"));
    };

    img.src = objectUrl;
  });
}

interface ImageUploaderProps {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
}

export function ImageUploader({ onImageSelect, disabled = false }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Formato no soportado. Usá JPG, PNG o WebP.";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "La imagen supera los 10 MB.";
    }
    return null;
  }

  async function handleFile(file: File) {
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsResizing(true);

    try {
      const resized = await resizeImage(file);

      // Revoke previous preview URL
      if (preview) URL.revokeObjectURL(preview);

      const url = URL.createObjectURL(resized);
      setPreview(url);
      onImageSelect(resized);
    } catch {
      setError("Error al optimizar la imagen. Intentá con otra.");
    } finally {
      setIsResizing(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  function clearPreview() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
  }

  // ── Resizing state ──
  if (isResizing) {
    return (
      <div className="flex flex-col items-center justify-center gap-[13px] rounded-none border border-midnight-ink bg-warm-sand p-[24px] min-h-[200px]">
        <div className="animate-spin h-[24px] w-[24px] border border-midnight-ink border-t-transparent rounded-none" />
        <p className="text-[15px] text-midnight-ink font-sans font-normal">
          Optimizando para IA...
        </p>
      </div>
    );
  }

  // ── Preview state ──
  if (preview) {
    return (
      <div className="relative rounded-none border border-midnight-ink bg-bone-white">
        <div className="relative aspect-[3/4] w-full max-h-[450px]">
          <Image src={preview} alt="Vista previa" fill className="object-cover" unoptimized />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-[13px] p-[13px] border-t border-midnight-ink">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              clearPreview();
              inputRef.current?.click();
            }}
          >
            <Camera size={14} strokeWidth={1.5} />
            Cambiar foto
          </Button>

          <button
            type="button"
            disabled={disabled}
            onClick={clearPreview}
            className="inline-flex items-center justify-center size-[36px] rounded-none border border-midnight-ink bg-bone-white text-midnight-ink hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50"
            aria-label="Quitar imagen"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  // ── Drop zone state ──
  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) inputRef.current?.click();
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-[13px] rounded-none border border-midnight-ink p-[24px] cursor-pointer font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2",
          "min-h-[200px]",
          isDragging
            ? "border-midnight-ink bg-warm-sand"
            : "border-midnight-ink bg-bone-white hover:bg-warm-sand",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload size={28} strokeWidth={1} className="text-midnight-ink" />
        <div className="text-center">
          <p className="text-[15px] text-midnight-ink font-sans font-normal">
            Arrastrá tu foto acá
          </p>
          <p className="text-[13px] text-midnight-ink mt-[6px] font-mono font-normal">
            o hacé click para seleccionar
          </p>
        </div>
        <p className="text-[13px] text-midnight-ink mt-[6px] font-mono font-normal">
          Máximo 10 MB — JPG, PNG o WebP
        </p>
      </div>

      {error && (
        <p className="text-[15px] text-midnight-ink mt-[13px] p-[13px] border border-dotted border-midnight-ink bg-warm-sand font-sans font-normal break-words">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
