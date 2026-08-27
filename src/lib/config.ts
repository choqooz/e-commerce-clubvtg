// ── Business Configuration ──
// All prices in ARS (Argentine Pesos)

export const SITE_NAME = "clubvtg";
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clubvtg.com";

function readIntegerEnv(name: string, defaultValue: number, minimum: number): number {
  const value = process.env[name];

  if (value === undefined) return defaultValue;

  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Invalid environment variable ${name}: expected a finite safe integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(
      `Invalid environment variable ${name}: expected a finite safe integer greater than or equal to ${minimum}.`,
    );
  }

  return parsed;
}

export const SHIPPING_FEE = readIntegerEnv("SHIPPING_FLAT_FEE", 5000, 0);

export const CREDIT_PACKS = [
  {
    id: "basic",
    name: "Básico",
    credits: readIntegerEnv("CREDIT_PACK_BASIC_AMOUNT", 3, 1),
    price: readIntegerEnv("CREDIT_PACK_BASIC_PRICE", 1500, 1),
    popular: false,
  },
  {
    id: "popular",
    name: "Popular",
    credits: readIntegerEnv("CREDIT_PACK_POPULAR_AMOUNT", 7, 1),
    price: readIntegerEnv("CREDIT_PACK_POPULAR_PRICE", 3000, 1),
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    credits: readIntegerEnv("CREDIT_PACK_PRO_AMOUNT", 15, 1),
    price: readIntegerEnv("CREDIT_PACK_PRO_PRICE", 5500, 1),
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
