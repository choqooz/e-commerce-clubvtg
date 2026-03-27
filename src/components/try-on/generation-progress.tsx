"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TryOnStep } from "@/lib/types";

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

export function GenerationProgress({
  currentStep,
  isGenerating,
}: GenerationProgressProps) {
  return (
    <div className="space-y-0" role="list" aria-label="Progreso de generación">
      {STEPS.map((step, i) => {
        const status = getStepStatus(step.key, currentStep, isGenerating);
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step.key} className="flex gap-3" role="listitem">
            {/* Vertical line + icon column */}
            <div className="flex flex-col items-center">
              {/* Icon */}
              <div
                className={cn(
                  "flex items-center justify-center w-6 h-6 shrink-0",
                  status === "completed" && "text-foreground",
                  status === "current" && "text-accent",
                  status === "pending" && "text-muted-foreground/40",
                )}
              >
                {status === "completed" && (
                  <Check size={14} strokeWidth={2} />
                )}
                {status === "current" && (
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                )}
                {status === "pending" && (
                  <Circle size={8} strokeWidth={2} />
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 min-h-4",
                    status === "completed"
                      ? "bg-foreground/20"
                      : "bg-border",
                  )}
                />
              )}
            </div>

            {/* Label */}
            <div
              className={cn(
                "pb-4 text-sm font-sans",
                status === "completed" && "text-foreground/70",
                status === "current" && "text-foreground font-medium",
                status === "pending" && "text-muted-foreground/50",
              )}
            >
              <span
                className={cn(
                  status === "current" &&
                    step.key === "generating" &&
                    "animate-pulse",
                )}
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
