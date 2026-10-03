import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/app/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: "400",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: "400",
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
    <ClerkProvider localization={esES} afterSignOutUrl="/">
      <html lang="es" className={`${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}>
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
