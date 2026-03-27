import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <h3 className="font-heading text-xl font-medium mb-4">clubvtg</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Prendas vintage únicas curadas para el guardarropa moderno. Cada
              pieza tiene una historia.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-sans font-medium mb-4 text-foreground">
              Tienda
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Catálogo
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Tops
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Bottoms
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Outerwear
                </Link>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-sans font-medium mb-4 text-foreground">
              Ayuda
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Envíos
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Devoluciones
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4">
                  Contacto
                </Link>
              </li>
            </ul>
          </div>

          {/* Subscribe */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-sans font-medium mb-4 text-foreground">
              Suscribite
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Recibí novedades y ofertas exclusivas.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="tu@email.com"
                className="flex-1 border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus:border-foreground transition-colors duration-200 font-sans"
              />
              <button className="bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-widest font-sans font-medium hover:opacity-90 transition-opacity">
                Unirme
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} clubvtg. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
