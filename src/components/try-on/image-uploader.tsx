"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import Image from "next/image";
import { Upload, Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

export function ImageUploader({
  onImageSelect,
  disabled = false,
}: ImageUploaderProps) {
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
      <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-accent bg-accent/5 p-8 min-h-[200px]">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        <p className="text-sm text-foreground font-sans">
          Optimizando para IA...
        </p>
      </div>
    );
  }

  // ── Preview state ──
  if (preview) {
    return (
      <div className="relative border border-border bg-card">
        <div className="relative aspect-[3/4] w-full">
          <Image
            src={preview}
            alt="Vista previa"
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        <div className="flex items-center justify-between p-3 border-t border-border">
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
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
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
          "flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 transition-all duration-200 cursor-pointer",
          "min-h-[200px]",
          isDragging
            ? "border-accent bg-accent/5 scale-[1.01]"
            : "border-border hover:border-foreground/40 hover:bg-muted/50",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload
          size={28}
          strokeWidth={1}
          className="text-muted-foreground"
        />
        <div className="text-center">
          <p className="text-sm text-foreground font-sans">
            Arrastrá tu foto acá
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-sans">
            o hacé click para seleccionar
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-1 font-sans">
          Máximo 10 MB — JPG, PNG o WebP
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive mt-2 font-sans">{error}</p>
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
