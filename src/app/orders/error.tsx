"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <h1 className="text-4xl font-heading font-light tracking-wide mb-4">
        Error al cargar tus pedidos
      </h1>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Ocurrió un error inesperado cargando tus pedidos. Por favor intentá de nuevo.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
