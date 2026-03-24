import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <p className="text-sm uppercase tracking-widest text-muted-foreground mb-4 font-sans">
        404 — Página no encontrada
      </p>
      <h1 className="text-5xl md:text-6xl font-heading font-light tracking-wide mb-6">
        Esta prenda ya no está
      </h1>
      <p className="text-muted-foreground max-w-md mb-10">
        Lo que buscás no existe o fue retirado del catálogo. Explorá nuestra
        colección para encontrar prendas vintage únicas.
      </p>
      <Button asChild>
        <Link href="/">Explorar la tienda</Link>
      </Button>
    </div>
  );
}
