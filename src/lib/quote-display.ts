import { formatPrice } from "./config";

export function formatQuoteCents(cents: string): string {
  return formatPrice(Number(cents) / 100);
}
