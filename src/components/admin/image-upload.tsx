"use client";

import { useState } from "react";
import Image from "next/image";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
      const message =
        err instanceof Error ? err.message : "Ocurrió un problema inesperado";
      toast.error("Error al subir", { description: message });
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemove(urlToRemove: string) {
    onChange(value.filter((url) => url !== urlToRemove));
  }

  return (
    <div className="space-y-4 w-full">
      {/* Grid of uploaded images */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {value.map((url, i) => (
            <div key={url} className="relative w-full aspect-[4/5] bg-muted rounded-md overflow-hidden border group">
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
                className="absolute top-2 right-2 rounded-full w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleRemove(url)}
                disabled={disabled}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {value.length < 5 && (
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/30 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            {isUploading ? (
              <Loader2 className="w-6 h-6 mb-2 animate-spin text-primary" />
            ) : (
              <Upload className="w-6 h-6 mb-2" />
            )}
            <p className="text-sm font-medium">Subir foto {value.length + 1}</p>
          </div>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleUpload}
            disabled={disabled || isUploading}
          />
        </label>
      )}
    </div>
  );
}
