"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/config";
import type { CreditPackId } from "@/lib/types";
import { cn } from "@/lib/utils";

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
        "relative min-w-0 border border-midnight-ink bg-bone-white p-[13px] pt-[30px] text-midnight-ink font-sans font-normal leading-[1.3]",
        popular && "bg-warm-sand",
      )}
    >
      {popular && (
        <Badge className="absolute -top-[13px] left-[13px] bg-midnight-ink text-bone-white border-midnight-ink text-[13px] font-mono font-normal uppercase">
          Más Popular
        </Badge>
      )}

      {/* Pack name */}
      <p
        className={cn(
          "text-[13px] uppercase font-mono font-normal",
          popular ? "text-midnight-ink" : "text-midnight-ink",
        )}
      >
        {name}
      </p>

      {/* Credit count — big number */}
      <p className="font-sans text-[30px] font-normal mt-[13px]">
        {credits}
        <span className="text-[15px] text-midnight-ink ml-[6px] font-sans font-normal">
          créditos
        </span>
      </p>

      {/* Price */}
      <p className="text-[15px] text-midnight-ink mt-[6px] font-sans">{formatPrice(price)}</p>

      {/* Buy button */}
      <Button
        variant={popular ? "default" : "outline"}
        size="lg"
        className="w-full mt-[24px] whitespace-normal"
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
