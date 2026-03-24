// ── Shared Constants ──
// Color map, filter options, and other shared values.

/** Hex/gradient map for rendering color swatches */
export const COLOR_MAP: Record<string, string> = {
  negro: "#000000",
  blanco: "#ffffff",
  marrón: "#5c4033",
  marron: "#5c4033",
  crudo: "#F5F5DC",
  beige: "#F5F5DC",
  rojo: "#ef4444",
  azul: "#3b82f6",
  verde: "#22c55e",
  amarillo: "#eab308",
  rosa: "#ec4899",
  gris: "#71717a",
  celeste: "#38bdf8",
  naranja: "#f97316",
  bordo: "#7f1d1d",
  bordó: "#7f1d1d",
  violeta: "#8b5cf6",
  lila: "#a78bfa",
  navy: "#1e3a8a",
  multicolor:
    "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
};

/** Canonical color entries shown in the catalog filter */
export const FILTER_COLORS = [
  { name: "Negro", key: "negro" },
  { name: "Blanco", key: "blanco" },
  { name: "Azul", key: "azul" },
  { name: "Rojo", key: "rojo" },
  { name: "Verde", key: "verde" },
  { name: "Amarillo", key: "amarillo" },
  { name: "Naranja", key: "naranja" },
  { name: "Rosa", key: "rosa" },
  { name: "Violeta", key: "violeta" },
  { name: "Marrón", key: "marrón" },
  { name: "Gris", key: "gris" },
  { name: "Beige", key: "beige" },
  { name: "Multicolor", key: "multicolor" },
] as const;

/** Price brackets in ARS for the catalog filter */
export const PRICE_BRACKETS = [
  { label: "Hasta $15.000", min: 0, max: 15_000 },
  { label: "$15.000 – $30.000", min: 15_000, max: 30_000 },
  { label: "$30.000 – $50.000", min: 30_000, max: 50_000 },
  { label: "Más de $50.000", min: 50_000, max: Infinity },
] as const;

/** Condition options (ordered best → worst) */
export const CONDITION_OPTIONS = [
  "Nuevo",
  "Excelente",
  "Muy Bueno",
  "Bueno",
  "Regular",
] as const;
