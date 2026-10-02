"use client";

import { Upload, X, Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface MultiImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

export function MultiImageUpload({ value, onChange, disabled }: MultiImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      if (!e.target.files || e.target.files.length === 0) return;

      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      setIsUploading(true);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo subir la imagen al servidor");
      }

      // Add new url to the array
      onChange([...value, data.publicUrl]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ocurrió un problema inesperado";
      toast.error("Error al subir", { description: message });
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemove(urlToRemove: string) {
    onChange(value.filter((url) => url !== urlToRemove));
  }

  return (
    <div className="w-full space-y-[13px] font-mono text-[13px] font-normal text-midnight-ink">
      {/* Grid of uploaded images */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-[13px]">
          {value.map((url, i) => (
            <div
              key={url}
              className="relative aspect-square w-[96px] max-w-full overflow-hidden border border-midnight-ink bg-warm-sand"
            >
              <Image
                src={url}
                alt={`Preview ${i}`}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-0 right-0"
                aria-label={`Quitar foto ${i + 1}`}
                onClick={() => handleRemove(url)}
                disabled={disabled}
              >
                <X aria-hidden="true" className="size-[16px]" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {value.length < 5 && (
        <label
          data-disabled={disabled || isUploading}
          className="relative flex min-h-[96px] w-full cursor-pointer flex-col items-center justify-center border border-midnight-ink bg-bone-white p-[13px] hover:bg-warm-sand focus-within:outline-2 focus-within:outline-solid focus-within:outline-offset-2 focus-within:outline-midnight-ink data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
        >
          <input
            type="file"
            className="sr-only"
            accept="image/*"
            onChange={handleUpload}
            disabled={disabled || isUploading}
          />
          <div className="flex flex-col items-center justify-center gap-[13px]">
            {isUploading ? (
              <Loader2 aria-hidden="true" className="size-[16px] animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="size-[16px]" />
            )}
            <p>Subir foto {value.length + 1}</p>
          </div>
        </label>
      )}
    </div>
  );
}
