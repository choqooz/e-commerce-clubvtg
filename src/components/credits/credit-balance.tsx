"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditBalanceProps {
  credits: number;
  className?: string;
}

export function CreditBalance({ credits, className }: CreditBalanceProps) {
  const isEmpty = credits === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tracking-wide transition-colors",
        isEmpty
          ? "text-muted-foreground/60"
          : "text-foreground/70 hover:text-foreground",
        className,
      )}
    >
      <Sparkles
        size={14}
        strokeWidth={1.5}
        className={cn(isEmpty && "opacity-50")}
      />
      <span className="tabular-nums">{credits}</span>
    </span>
  );
}
