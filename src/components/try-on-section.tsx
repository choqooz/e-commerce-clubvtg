import Link from "next/link";
import { Sparkles } from "lucide-react";

interface TryOnSectionProps {
  productSlug: string;
}

export default function TryOnSection({ productSlug }: TryOnSectionProps) {
  return (
    <div className="border-t border-border pt-6 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-accent" />
        <h3 className="text-xs uppercase tracking-widest font-sans font-medium">
          Probátelo virtualmente
        </h3>
      </div>

      <p className="text-sm text-muted-foreground font-sans mb-5 leading-relaxed">
        Subí tu foto y usá inteligencia artificial para verte con esta prenda.
      </p>

      <Link
        href={`/try-on/${productSlug}`}
        className="w-full border border-foreground text-foreground py-3 text-sm uppercase tracking-widest font-sans font-medium hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2"
      >
        <Sparkles size={14} />
        Probar ahora
      </Link>

      <p className="text-[11px] text-muted-foreground text-center font-sans mt-2">
        Usa 1 crédito por generación
      </p>
    </div>
  );
}
