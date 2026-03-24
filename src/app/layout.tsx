import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { Toaster } from "sonner";
import { CartProvider } from "@/contexts/cart-context";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClubVTG — Vintage Curado",
  description:
    "Prendas vintage únicas seleccionadas para el guardarropa moderno. Probador virtual con IA.",
  keywords: ["vintage", "ropa", "moda", "segunda mano", "curado", "try-on"],
  openGraph: {
    title: "ClubVTG — Vintage Curado",
    description:
      "Prendas vintage únicas. Probá antes de comprar con nuestro probador virtual.",
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
      <html
        lang="es"
        className={`${dmSans.variable} ${cormorant.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col font-sans">
          <CartProvider>
            {children}
            <Toaster position="bottom-right" richColors />
          </CartProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
