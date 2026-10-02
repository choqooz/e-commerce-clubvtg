import { Sparkles } from "lucide-react";
import Link from "next/link";

interface TryOnSectionProps {
  productSlug: string;
}

export function TryOnSection({ productSlug }: TryOnSectionProps) {
  return (
    <div className="border-t border-midnight-ink pt-[24px] mt-[18px] text-midnight-ink font-sans font-normal">
      <div className="flex items-center gap-[6px] mb-[13px]">
        <Sparkles size={14} className="text-midnight-ink" />
        <h3 className="font-mono text-[13px] font-normal leading-[1.2]">Probátelo virtualmente</h3>
      </div>

      <p className="text-[15px] font-sans font-normal mb-[18px] leading-[1.3]">
        Subí tu foto y usá inteligencia artificial para verte con esta prenda.
      </p>

      <Link
        href={`/try-on/${productSlug}`}
        className="w-full min-h-[36px] rounded-none border border-midnight-ink bg-bone-white text-midnight-ink px-[6px] py-[2px] font-mono text-[13px] font-normal hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 flex items-center justify-center gap-[6px]"
      >
        <Sparkles size={14} />
        Probar ahora
      </Link>

      <p className="text-[13px] text-midnight-ink text-center font-mono font-normal mt-[6px] leading-[1.2]">
        Usa 1 crédito por generación
      </p>
    </div>
  );
}
