"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Upload, ImageIcon, X, Sparkles } from "lucide-react";

interface TryOnSectionProps {
  productName: string;
}

export default function TryOnSection({ productName }: TryOnSectionProps) {
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedPhoto(ev.target?.result as string);
      setGeneratedImage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = () => {
    if (!uploadedPhoto) return;
    setIsGenerating(true);
    // TODO: Connect to real AI endpoint (POST /api/ai/process)
    // For now, simulate with a timeout
    setTimeout(() => {
      setGeneratedImage(uploadedPhoto); // placeholder result
      setIsGenerating(false);
    }, 2500);
  };

  const clearPhoto = () => {
    setUploadedPhoto(null);
    setGeneratedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="border-t border-border pt-6 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} className="text-accent" />
        <h3 className="text-xs uppercase tracking-widest font-sans font-medium">
          Probador Virtual
        </h3>
      </div>
      <p className="text-sm text-muted-foreground font-sans mb-4">
        Subí tu foto para ver cómo te queda esta prenda. Usa 1 crédito por
        generación.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Upload area */}
        <div className="relative">
          {uploadedPhoto ? (
            <div className="relative aspect-[3/4] bg-secondary">
              <Image
                src={uploadedPhoto}
                alt="Tu foto"
                fill
                unoptimized
                className="object-cover"
              />
              <button
                onClick={clearPhoto}
                className="absolute top-2 right-2 w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                <X size={12} />
              </button>
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest bg-background/80 text-foreground px-2 py-1 font-sans">
                Tu foto
              </span>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[3/4] border-2 border-dashed border-border hover:border-foreground/40 transition-colors flex flex-col items-center justify-center gap-3"
            >
              <Upload size={24} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-sans">
                Subir foto
              </span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Result area */}
        <div className="relative aspect-[3/4] bg-secondary flex items-center justify-center">
          {generatedImage ? (
            <>
              <Image
                src={generatedImage}
                alt="Resultado try-on"
                fill
                unoptimized
                className="object-cover"
              />
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest bg-background/80 text-foreground px-2 py-1 font-sans">
                Resultado
              </span>
            </>
          ) : isGenerating ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground font-sans">
                Generando...
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon size={24} className="text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50 font-sans">
                Resultado
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Generate button */}
      {uploadedPhoto && !generatedImage && !isGenerating && (
        <button
          onClick={handleGenerate}
          className="w-full mt-4 border border-foreground text-foreground py-3 text-sm uppercase tracking-widest font-sans font-medium hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2"
        >
          <Sparkles size={14} />
          Generar Try-On
        </button>
      )}

      {generatedImage && (
        <button
          onClick={clearPhoto}
          className="w-full mt-4 border border-border text-muted-foreground py-3 text-sm uppercase tracking-widest font-sans font-medium hover:border-foreground hover:text-foreground transition-all"
        >
          Probar con otra foto
        </button>
      )}
    </div>
  );
}
