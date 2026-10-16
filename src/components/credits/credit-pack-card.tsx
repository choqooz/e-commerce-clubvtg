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
    <article
      aria-labelledby={`credit-pack-${packId}`}
      className={cn(
        "relative flex min-w-0 flex-col border border-midnight-ink bg-bone-white p-[24px] pt-[36px] text-midnight-ink font-sans font-normal leading-[1.5]",
        popular && "bg-warm-sand",
      )}
    >
      {popular && (
        <Badge className="absolute -top-[13px] left-[24px] bg-midnight-ink text-bone-white border-midnight-ink text-[13px] font-mono font-normal uppercase">
          Más Popular
        </Badge>
      )}

      {/* Pack name */}
      <h3
        id={`credit-pack-${packId}`}
        className={cn(
          "min-h-[36px] break-words text-[13px] uppercase font-mono font-normal",
          popular ? "text-midnight-ink" : "text-midnight-ink",
        )}
      >
        {name}
      </h3>

      {/* Credit count — big number */}
      <p className="mt-[18px] flex flex-wrap items-baseline gap-[6px] break-words font-sans text-[48px] font-normal leading-[1.1]">
        {credits}
        <span className="text-[15px] text-midnight-ink font-sans font-normal leading-[1.5]">
          créditos
        </span>
      </p>

      {/* Price */}
      <p className="mb-[30px] mt-[18px] break-words font-sans text-[24px] font-normal leading-[1.3] text-midnight-ink">
        {formatPrice(price)}
      </p>

      {/* Buy button */}
      <Button
        variant={popular ? "default" : "outline"}
        size="lg"
        className="mt-auto h-auto min-h-[48px] w-full whitespace-normal px-[18px] py-[12px]"
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
    </article>
  );
}
