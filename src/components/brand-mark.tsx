import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  tone?: "black" | "white";
  alt?: string;
  className?: string;
};

export function BrandMark({ tone = "black", alt = "clubvtg", className }: BrandMarkProps) {
  return (
    <Image
      src={`/branding/clubvtg/clubvtg-horizontal-${tone}.svg`}
      alt={alt}
      width={554}
      height={194}
      unoptimized
      className={cn("block h-auto w-[180px] shrink-0", className)}
    />
  );
}
