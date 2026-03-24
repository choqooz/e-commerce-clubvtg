"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-3xl font-heading font-medium tracking-wide mb-4">
        Error en el panel
      </h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Ocurrió un error cargando esta sección del administrador.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
