"use client";

import { ChevronRight, Coins, AlertCircle, RotateCcw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { CartDrawer } from "@/components/cart-drawer";
import { CreditBalance } from "@/components/credits/credit-balance";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { GenerationProgress } from "@/components/try-on/generation-progress";
import { ImageUploader } from "@/components/try-on/image-uploader";
import { ResultViewer } from "@/components/try-on/result-viewer";
import { parseSSEErrorEvent } from "@/components/try-on/sse";
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

export function TryOnPageContent({ product, initialCredits }: TryOnPageContentProps) {
  const [state, setState] = useState<TryOnState>({ phase: "idle" });
  const [credits, setCredits] = useState(initialCredits);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const productImage =
    product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : null;

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

        if (!response.body) {
          setState({
            phase: "error",
            message: "Error de conexión con el servidor",
          });
          return;
        }

        if (!response.ok) {
          const event = parseSSEErrorEvent(await response.text());
          setState({
            phase: "error",
            message: event?.message ?? "Error de conexión con el servidor",
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
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans text-[15px] font-normal leading-[1.3]">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="px-[18px] md:px-[30px] py-[18px] border-b border-midnight-ink">
          <nav className="flex flex-wrap items-center gap-[6px] font-mono text-[13px] font-normal break-words">
            <Link
              href="/"
              className="min-h-[36px] inline-flex items-center hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <Link
              href={`/product/${product.slug}`}
              className="min-h-[36px] min-w-0 inline-flex items-center break-all hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              {product.title}
            </Link>
            <ChevronRight size={12} />
            <span className="text-midnight-ink">Prueba virtual</span>
          </nav>
        </div>

        {/* Main Content */}
        <div className="px-[18px] md:px-[30px] py-[42px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[42px]">
            {/* ── Left Column: Product Info ── */}
            <div className="min-w-0 space-y-[24px]">
              {/* Product Image */}
              {productImage ? (
                <div className="relative aspect-[3/4] w-full max-h-[500px] overflow-hidden rounded-none bg-warm-sand">
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
                <div className="aspect-[3/4] w-full max-h-[500px] rounded-none bg-warm-sand flex items-center justify-center text-midnight-ink">
                  Sin imagen
                </div>
              )}

              {/* Product Details */}
              <div className="space-y-[6px]">
                <p className="font-mono text-[13px] font-normal">{product.category}</p>
                <h1 className="text-[30px] font-sans font-normal leading-none break-words">
                  {product.title}
                </h1>
                <p className="text-[20px] font-normal leading-[1.3]">
                  {formatPrice(product.price)}
                </p>
              </div>
            </div>

            {/* ── Right Column: Try-On Flow ── */}
            <div className="min-w-0 space-y-[24px]">
              {/* Credit Balance */}
              <CreditBalance credits={credits} />

              {/* No Credits Warning */}
              {credits === 0 && state.phase === "idle" && (
                <div className="rounded-none border border-midnight-ink bg-warm-sand p-[18px] flex items-start gap-[13px]">
                  <Coins className="size-[20px] text-midnight-ink shrink-0 mt-[2px]" />
                  <div className="min-w-0 space-y-[6px]">
                    <p className="font-mono text-[13px] font-normal text-midnight-ink">
                      Sin créditos
                    </p>
                    <p className="text-[15px] text-midnight-ink">
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
                <div className="space-y-[18px]">
                  <div>
                    <h2 className="text-[20px] font-sans font-normal leading-[1.3]">
                      Subí tu foto
                    </h2>
                    <p className="text-[15px] text-midnight-ink mt-[6px]">
                      Subí una foto tuya de cuerpo entero para ver cómo te queda esta prenda.
                    </p>
                  </div>
                  <ImageUploader onImageSelect={startGeneration} />
                  <p className="font-mono text-[13px] text-midnight-ink text-center">
                    Se descontará 1 crédito al generar. Te quedan{" "}
                    <span className="font-normal text-midnight-ink">{credits}</span> créditos.
                  </p>
                </div>
              )}

              {/* ── Phase: Generating → Progress ── */}
              {state.phase === "generating" && (
                <div className="space-y-[18px]">
                  <h2 className="text-[20px] font-sans font-normal leading-[1.3]">
                    Generando prueba virtual...
                  </h2>
                  <GenerationProgress currentStep={state.step} isGenerating={isGenerating} />
                </div>
              )}

              {/* ── Phase: Complete → Result Viewer ── */}
              {state.phase === "complete" && selectedImage && (
                <div className="space-y-[18px]">
                  <h2 className="text-[20px] font-sans font-normal leading-[1.3]">Resultado</h2>
                  <ResultViewer
                    originalImageUrl={selectedImage}
                    resultImageUrl={state.resultUrl}
                    productTitle={product.title}
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[13px]">
                    <p className="font-mono text-[13px] text-midnight-ink">
                      Créditos restantes:{" "}
                      <span className="font-normal text-midnight-ink">
                        {state.creditsRemaining}
                      </span>
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRetry}>
                      <RotateCcw className="size-[14px]" />
                      Probar otra foto
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Phase: Error ── */}
              {state.phase === "error" && (
                <div className="space-y-[18px]">
                  <div className="rounded-none border border-dotted border-midnight-ink bg-warm-sand p-[18px] flex items-start gap-[13px]">
                    <AlertCircle className="size-[20px] text-midnight-ink shrink-0 mt-[2px]" />
                    <div className="min-w-0 space-y-[6px]">
                      <p className="font-mono text-[13px] font-normal text-midnight-ink">
                        Error en la generación
                      </p>
                      <p className="text-[15px] text-midnight-ink break-words">{state.message}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    <RotateCcw className="size-[14px]" />
                    Intentar de nuevo
                  </Button>
                </div>
              )}

              {/* Back to product */}
              <div className="pt-[18px] border-t border-midnight-ink">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/product/${product.slug}`}>&larr; Volver al producto</Link>
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
