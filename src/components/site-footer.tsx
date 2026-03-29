import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <h3 className="font-heading text-xl font-medium mb-4">clubvtg</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Prendas vintage únicas curadas para el guardarropa moderno. Cada pieza tiene una
              historia.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-sans font-medium mb-4 text-foreground">
              Tienda
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/"
                  className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4"
                >
                  Catálogo
                </Link>
              </li>
              <li>
                <Link
                  href="/credits"
                  className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4"
                >
                  Créditos IA
                </Link>
              </li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-sans font-medium mb-4 text-foreground">
              Información
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <span className="cursor-default">Envíos a todo el país · Correo Argentino</span>
              </li>
              <li>
                <a
                  href="mailto:choqooz@gmail.com"
                  className="hover:text-foreground transition-colors duration-200 hover:underline underline-offset-4"
                >
                  Contacto
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} clubvtg. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
