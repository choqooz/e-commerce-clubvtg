"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import type { TryOnStep } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GenerationProgressProps {
  currentStep: TryOnStep | null;
  isGenerating: boolean;
}

const STEPS: { key: TryOnStep; label: string }[] = [
  { key: "validating", label: "Validando imagen…" },
  { key: "uploading", label: "Subiendo foto…" },
  { key: "processing", label: "Procesando…" },
  { key: "content_check", label: "Verificando contenido…" },
  { key: "generating", label: "Generando prueba virtual…" },
  { key: "finalizing", label: "Finalizando…" },
];

function getStepStatus(
  stepKey: TryOnStep,
  currentStep: TryOnStep | null,
  isGenerating: boolean,
): "completed" | "current" | "pending" {
  if (!currentStep || !isGenerating) return "pending";

  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  const stepIndex = STEPS.findIndex((s) => s.key === stepKey);

  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "current";
  return "pending";
}

export function GenerationProgress({ currentStep, isGenerating }: GenerationProgressProps) {
  return (
    <div className="space-y-0 text-midnight-ink" role="list" aria-label="Progreso de generación">
      {STEPS.map((step, i) => {
        const status = getStepStatus(step.key, currentStep, isGenerating);
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step.key} className="flex gap-[13px]" role="listitem">
            {/* Vertical line + icon column */}
            <div className="flex flex-col items-center">
              {/* Icon */}
              <div
                className={cn(
                  "flex items-center justify-center w-[24px] h-[24px] shrink-0",
                  status === "completed" && "text-midnight-ink",
                  status === "current" && "text-midnight-ink bg-warm-sand",
                  status === "pending" && "text-midnight-ink",
                )}
              >
                {status === "completed" && <Check size={14} strokeWidth={2} />}
                {status === "current" && (
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                )}
                {status === "pending" && <Circle size={8} strokeWidth={2} />}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-[1px] flex-1 min-h-[18px]",
                    status === "completed" ? "bg-midnight-ink" : "bg-ash-gray",
                  )}
                />
              )}
            </div>

            {/* Label */}
            <div
              className={cn(
                "pb-[18px] pt-[6px] text-[13px] font-mono font-normal leading-[1.2]",
                status === "completed" && "text-midnight-ink",
                status === "current" && "text-midnight-ink underline underline-offset-[3px]",
                status === "pending" && "text-midnight-ink",
              )}
            >
              <span
                className={cn(status === "current" && step.key === "generating" && "font-normal")}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
