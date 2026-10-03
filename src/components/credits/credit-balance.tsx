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
        "inline-flex items-center gap-[6px] font-mono text-[13px] leading-[1.2] font-normal",
        isEmpty ? "text-midnight-ink/70" : "text-midnight-ink",
        className,
      )}
    >
      <Sparkles size={14} strokeWidth={1.5} className={cn(isEmpty && "opacity-50")} />
      <span className="tabular-nums">{credits}</span>
    </span>
  );
}
