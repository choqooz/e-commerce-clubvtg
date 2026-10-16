import Link from "next/link";

const stories = [
  {
    title: ["Vintage", "curado"],
    body: "Prendas vintage únicas curadas para el guardarropa moderno. Cada pieza tiene una historia. En clubvtg, la colección reúne prendas de distintas categorías para descubrir a tu manera.",
  },
  {
    title: ["Piezas", "únicas"],
    body: "Cada prenda tiene su propio talle, color y detalles. Explorá el catálogo y consultá la información de cada pieza: sus medidas, su condición y las fotos forman parte de su historia.",
  },
  {
    title: ["Envíos", "nacionales"],
    body: "Envíos a todo el país · Correo Argentino. Podés recorrer la colección desde donde estés y consultar las prendas disponibles en el catálogo. Para ponerte en contacto con clubvtg, escribinos por email.",
  },
  {
    title: ["Probador", "con IA"],
    body: "El probador virtual con IA está disponible para explorar cómo te queda una prenda. Funciona con créditos: podés consultar tu saldo desde tu cuenta y ver los packs disponibles en Créditos IA. La información de cada pieza sigue disponible en el catálogo para acompañar tu elección.",
  },
];

const linkClassName =
  "inline-flex min-h-[32px] items-start py-[8px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink";

export function SiteFooter() {
  return (
    <footer className="bg-white pb-[28px] font-sans font-normal text-midnight-ink">
      {/* Reconstruct the M6 editorial tracks; only the separate lower row is centered. */}
      <div className="grid grid-cols-[1fr_3fr] gap-x-[8px] gap-y-[30.8px] px-[14px] pt-[77px] text-left md:grid-cols-16 md:gap-y-[36.4px] md:px-0 md:pt-[91px]">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native home navigation resets the hash-only collection without requiring client hooks in the footer. */}
        <a
          href="/"
          aria-label="clubvtg — Inicio"
          className="row-span-4 flex min-w-0 items-center justify-center text-[20px] leading-[33px] tracking-[-0.04em] md:col-span-8 md:row-span-2 md:items-start md:pt-[64px] md:text-[111px] md:leading-[133px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
        >
          clubvtg
        </a>
        {stories.map(({ title, body }, index) => (
          <section
            key={title[0]}
            aria-labelledby={`footer-story-${index}`}
            className={`col-start-2 min-w-0 pl-[11px] pr-[22px] md:col-span-3 md:pl-[13px] md:pr-[26px] ${index % 2 === 0 ? "md:col-start-9" : "md:col-start-12"}`}
          >
            <h2
              id={`footer-story-${index}`}
              className="font-sans text-[20px] leading-[24px] font-normal uppercase md:mb-[12.8px]"
            >
              {title[0]}
              <br />
              {title[1]}
            </h2>
            <p className="font-mono text-[11px] leading-[15px] md:text-[13px] md:leading-[15.5px]">
              {body}
            </p>
          </section>
        ))}
      </div>

      <div className="mx-auto mt-[77px] grid max-w-[1280px] grid-cols-2 items-start gap-x-[18px] gap-y-[30.8px] px-[18px] text-center font-mono text-[11px] leading-[15px] md:mt-[91px] md:grid-cols-4 md:gap-x-[32px] md:px-[32px] md:text-[13px] md:leading-[15.5px]">
        <nav
          aria-label="Enlaces de la tienda"
          className="flex min-w-0 flex-col items-center px-[6px]"
        >
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native fragment navigation emits the collection's hashchange event on home. */}
          <a href="/#catalog" className={linkClassName}>
            Catálogo
          </a>
          <Link href="/credits" className={linkClassName}>
            Créditos IA
          </Link>
        </nav>
        <div className="min-w-0 px-[6px]">
          <p className="mx-auto min-h-[32px] max-w-[240px] pt-[8px]">
            Envíos a todo el país · Correo Argentino
          </p>
        </div>
        <div className="min-w-0 px-[6px]">
          <a href="mailto:choqooz@gmail.com" className={linkClassName}>
            Contacto
          </a>
        </div>
        <div className="min-w-0 px-[6px]">
          <p className="mx-auto min-h-[32px] max-w-[240px] pt-[8px]">
            © {new Date().getFullYear()} clubvtg. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
