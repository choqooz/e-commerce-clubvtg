import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { Providers } from "@/app/providers";
import "./globals.css";

// User-approved substitute for the reference F-Grotesk, not the original typeface.
const familjenGrotesk = localFont({
  src: "./fonts/FamiljenGrotesk-VariableFont_wght.woff2",
  variable: "--font-familjen-grotesk",
  weight: "400 700",
  style: "normal",
  display: "swap",
});

const maisonNeueMono = localFont({
  src: "./fonts/MaisonNeueMono-Regular.woff2",
  variable: "--font-maison-neue-mono-local",
  weight: "400",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClubVTG — Vintage Curado",
  description:
    "Prendas vintage únicas seleccionadas para el guardarropa moderno. Probador virtual con IA.",
  keywords: ["vintage", "ropa", "moda", "segunda mano", "curado", "try-on"],
  openGraph: {
    title: "ClubVTG — Vintage Curado",
    description: "Prendas vintage únicas. Probá antes de comprar con nuestro probador virtual.",
    type: "website",
    locale: "es_AR",
    url: "https://clubvtg.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      localization={esES}
      afterSignOutUrl="/"
      appearance={{
        options: { logoImageUrl: "/branding/clubvtg/clubvtg-horizontal-black.svg" },
        elements: {
          logoBox: {
            alignSelf: "center",
            marginInline: "auto",
            width: "180px",
            maxWidth: "100%",
            height: "auto",
            aspectRatio: "554 / 194",
          },
          logoImage: {
            width: "100%",
            height: "auto",
            maxHeight: "none",
            aspectRatio: "554 / 194",
          },
        },
      }}
    >
      <html
        lang="es"
        className={`${familjenGrotesk.variable} ${maisonNeueMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col font-sans">
          <Providers>
            {children}
            <Toaster position="bottom-right" richColors />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
