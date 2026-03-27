"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CreditPackId } from "@/lib/types";

interface CreditPackCardProps {
  packId: CreditPackId;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
  onSelect: (id: CreditPackId) => void;
  loading?: boolean;
}

export function CreditPackCard({
  packId,
  name,
  credits,
  price,
  popular = false,
  onSelect,
  loading = false,
}: CreditPackCardProps) {
  return (
    <div
      className={cn(
        "relative border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-foreground/20",
        popular && "border-accent bg-accent/5 shadow-sm",
      )}
    >
      {popular && (
        <Badge className="absolute -top-2.5 left-4 bg-accent text-accent-foreground text-[10px] uppercase tracking-widest">
          Más Popular
        </Badge>
      )}

      {/* Pack name */}
      <p className={cn(
        "text-xs uppercase tracking-widest font-sans",
        popular ? "text-accent font-medium" : "text-muted-foreground"
      )}>
        {name}
      </p>

      {/* Credit count — big number */}
      <p className="font-heading text-4xl font-medium mt-3">
        {credits}
        <span className="text-base text-muted-foreground ml-1.5 font-sans font-normal">
          créditos
        </span>
      </p>

      {/* Price */}
      <p className="text-sm text-foreground/70 mt-2 font-sans">
        {formatPrice(price)}
      </p>

      {/* Buy button */}
      <Button
        variant={popular ? "default" : "outline"}
        size="lg"
        className="w-full mt-5"
        disabled={loading}
        onClick={() => onSelect(packId)}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Procesando…
          </>
        ) : (
          "Comprar"
        )}
      </Button>
    </div>
  );
}
