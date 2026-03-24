// ── Business Configuration ──
// All prices in ARS (Argentine Pesos)

export const SITE_NAME = "clubvtg";
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clubvtg.com";

export const SHIPPING_FEE = Number(process.env.SHIPPING_FLAT_FEE ?? 5000);

export const CREDIT_PACKS = [
  {
    id: "basic",
    name: "Básico",
    credits: Number(process.env.CREDIT_PACK_BASIC_AMOUNT ?? 3),
    price: Number(process.env.CREDIT_PACK_BASIC_PRICE ?? 1500),
    popular: false,
  },
  {
    id: "popular",
    name: "Popular",
    credits: Number(process.env.CREDIT_PACK_POPULAR_AMOUNT ?? 7),
    price: Number(process.env.CREDIT_PACK_POPULAR_PRICE ?? 3000),
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    credits: Number(process.env.CREDIT_PACK_PRO_AMOUNT ?? 15),
    price: Number(process.env.CREDIT_PACK_PRO_PRICE ?? 5500),
    popular: false,
  },
] as const;

export const CATEGORIES = [
  { id: "all", label: "Todo" },
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "outerwear", label: "Outerwear" },
  { id: "knitwear", label: "Knitwear" },
  { id: "accessories", label: "Accesorios" },
  { id: "footwear", label: "Calzado" },
] as const;

export type Category = (typeof CATEGORIES)[number]["id"];

export function formatPrice(price: number): string {
  return price.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
