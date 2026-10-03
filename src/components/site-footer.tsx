import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-midnight-ink bg-warm-sand font-sans font-normal text-midnight-ink">
      <div className="px-[18px] py-[42px] md:px-[24px]">
        <div className="grid grid-cols-1 gap-[42px] md:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="mb-[13px] font-sans text-[20px] leading-[1.3] font-normal">clubvtg</h3>
            <p className="max-w-[400px] text-[15px] leading-[1.3]">
              Prendas vintage únicas curadas para el guardarropa moderno. Cada pieza tiene una
              historia.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="mb-[13px] font-mono text-[13px] leading-[1.2] font-normal uppercase">
              Tienda
            </h4>
            <ul className="space-y-[13px] font-mono text-[13px] leading-[1.3]">
              <li>
                <Link
                  href="/"
                  className="hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                >
                  Catálogo
                </Link>
              </li>
              <li>
                <Link
                  href="/credits"
                  className="hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                >
                  Créditos IA
                </Link>
              </li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="mb-[13px] font-mono text-[13px] leading-[1.2] font-normal uppercase">
              Información
            </h4>
            <ul className="space-y-[13px] font-mono text-[13px] leading-[1.3]">
              <li>
                <span className="cursor-default">Envíos a todo el país · Correo Argentino</span>
              </li>
              <li>
                <a
                  href="mailto:choqooz@gmail.com"
                  className="hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                >
                  Contacto
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-[42px] border-t border-midnight-ink pt-[24px] text-center font-mono text-[13px] leading-[1.3]">
          © {new Date().getFullYear()} clubvtg. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
