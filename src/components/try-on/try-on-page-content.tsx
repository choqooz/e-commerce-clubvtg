"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Coins, AlertCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import CartDrawer from "@/components/cart-drawer";
import { ImageUploader } from "@/components/try-on/image-uploader";
import { GenerationProgress } from "@/components/try-on/generation-progress";
import { ResultViewer } from "@/components/try-on/result-viewer";
import { CreditBalance } from "@/components/credits/credit-balance";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/config";
import type { Product, TryOnSSEEvent, TryOnStep } from "@/lib/types";

// ── State Machine ──

type TryOnState =
  | { phase: "idle" }
  | { phase: "generating"; step: TryOnStep; message: string }
  | { phase: "complete"; resultUrl: string; creditsRemaining: number }
  | { phase: "error"; message: string };

interface TryOnPageContentProps {
  product: Product;
  initialCredits: number;
}

export function TryOnPageContent({
  product,
  initialCredits,
}: TryOnPageContentProps) {
  const [state, setState] = useState<TryOnState>({ phase: "idle" });
  const [credits, setCredits] = useState(initialCredits);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const productImage =
    product.image_urls && product.image_urls.length > 0
      ? product.image_urls[0]
      : null;

  // ── SSE Consumer (fetch + ReadableStream) ──

  const startGeneration = useCallback(
    async (imageFile: File) => {
      const objectUrl = URL.createObjectURL(imageFile);
      setSelectedImage(objectUrl);

      setState({
        phase: "generating",
        step: "validating",
        message: "Iniciando...",
      });

      try {
        const formData = new FormData();
        formData.append("productSlug", product.slug);
        formData.append("image", imageFile);

        const response = await fetch("/api/ai/process", {
          method: "POST",
          body: formData,
        });

        if (!response.ok || !response.body) {
          setState({
            phase: "error",
            message: "Error de conexión con el servidor",
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            let event: TryOnSSEEvent;
            try {
              event = JSON.parse(line.slice(6)) as TryOnSSEEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "progress":
                setState({
                  phase: "generating",
                  step: event.step,
                  message: event.message,
                });
                break;

              case "complete":
                setCredits(event.creditsRemaining);
                setState({
                  phase: "complete",
                  resultUrl: event.resultUrl,
                  creditsRemaining: event.creditsRemaining,
                });
                toast.success("Prueba virtual generada");
                break;

              case "error": {
                // Content guard rejections consume the credit (Option A)
                const guardCodes = [
                  "nsfw_content",
                  "no_person_detected",
                  "inappropriate_image",
                ] as const;
                const isGuardRejection = guardCodes.includes(
                  event.code as (typeof guardCodes)[number],
                );

                if (isGuardRejection) {
                  setCredits((prev) => Math.max(0, prev - 1));
                }
                if (event.code === "insufficient_credits") {
                  setCredits(0);
                }

                setState({
                  phase: "error",
                  message: isGuardRejection
                    ? `${event.message}. Se descontó 1 crédito.`
                    : event.message,
                });
                break;
              }
            }
          }
        }
      } catch {
        setState({
          phase: "error",
          message: "Error inesperado. Intentá de nuevo.",
        });
      }
    },
    [product.slug],
  );

  const handleRetry = useCallback(() => {
    setSelectedImage(null);
    setState({ phase: "idle" });
  }, []);

  // ── Layout ──

  const isGenerating = state.phase === "generating";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
            <Link
              href="/"
              className="hover:text-foreground transition-colors"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <Link
              href={`/product/${product.slug}`}
              className="hover:text-foreground transition-colors"
            >
              {product.title}
            </Link>
            <ChevronRight size={12} />
            <span className="text-foreground">Prueba virtual</span>
          </nav>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* ── Left Column: Product Info ── */}
            <div className="space-y-6">
              {/* Product Image */}
              {productImage ? (
                <div className="relative aspect-[3/4] w-full max-h-[500px] overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={productImage}
                    alt={product.title}
                    fill
                    className="object-contain"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                  />
                </div>
              ) : (
                <div className="aspect-[3/4] w-full rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  Sin imagen
                </div>
              )}

              {/* Product Details */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-sans">
                  {product.category}
                </p>
                <h1 className="text-2xl font-heading font-medium tracking-wide">
                  {product.title}
                </h1>
                <p className="text-lg font-medium">
                  {formatPrice(product.price)}
                </p>
              </div>
            </div>

            {/* ── Right Column: Try-On Flow ── */}
            <div className="space-y-6">
              {/* Credit Balance */}
              <CreditBalance credits={credits} />

              {/* No Credits Warning */}
              {credits === 0 && state.phase === "idle" && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                  <Coins className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      Sin créditos
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Necesitás al menos 1 crédito para generar una prueba virtual.
                    </p>
                    <Button asChild size="sm">
                      <Link href="/credits">Comprá créditos</Link>
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Phase: Idle → Image Uploader ── */}
              {state.phase === "idle" && credits > 0 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-heading font-medium tracking-wide">
                      Subí tu foto
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Subí una foto tuya de cuerpo entero para ver cómo te queda esta prenda.
                    </p>
                  </div>
                  <ImageUploader onImageSelect={startGeneration} />
                  <p className="text-xs text-muted-foreground text-center">
                    Se descontará 1 crédito al generar. Te quedan{" "}
                    <span className="font-medium text-foreground">{credits}</span>{" "}
                    créditos.
                  </p>
                </div>
              )}

              {/* ── Phase: Generating → Progress ── */}
              {state.phase === "generating" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-heading font-medium tracking-wide">
                    Generando prueba virtual...
                  </h2>
                  <GenerationProgress
                    currentStep={state.step}
                    isGenerating={isGenerating}
                  />
                </div>
              )}

              {/* ── Phase: Complete → Result Viewer ── */}
              {state.phase === "complete" && selectedImage && (
                <div className="space-y-4">
                  <h2 className="text-lg font-heading font-medium tracking-wide">
                    Resultado
                  </h2>
                  <ResultViewer
                    originalImageUrl={selectedImage}
                    resultImageUrl={state.resultUrl}
                    productTitle={product.title}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Créditos restantes:{" "}
                      <span className="font-medium text-foreground">
                        {state.creditsRemaining}
                      </span>
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRetry}>
                      <RotateCcw className="size-3.5" />
                      Probar otra foto
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Phase: Error ── */}
              {state.phase === "error" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                    <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-destructive">
                        Error en la generación
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {state.message}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    <RotateCcw className="size-3.5" />
                    Intentar de nuevo
                  </Button>
                </div>
              )}

              {/* Back to product */}
              <div className="pt-4 border-t">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/product/${product.slug}`}>
                    &larr; Volver al producto
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
