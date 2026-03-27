"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <h1 className="text-4xl font-heading font-light tracking-wide mb-4">
        No pudimos cargar la prueba virtual
      </h1>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Ocurrió un error inesperado. Por favor intentá de nuevo o volvé al
        producto.
      </p>
      <div className="flex items-center justify-center gap-4">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/">Volver a la tienda</Link>
        </Button>
      </div>
    </div>
  );
}
