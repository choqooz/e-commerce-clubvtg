import { describe, expect, it } from "vitest";
import { productSchema } from "./product";

const product = {
  title: "Vintage jacket",
  description: "A vintage jacket",
  price: "1250",
  category: "Jackets",
  image_urls: ["https://example.test/jacket.jpg"],
  status: "available",
};
const legacyGuid = "01234567-89ab-cdef-0123-456789abcdef";

describe("productSchema", () => {
  it("coerces prices and accepts optional, nullable, and existing GUID-shaped identifiers", () => {
    const parsed = productSchema.parse({
      ...product,
      product_type_id: legacyGuid,
      product_subtype_id: null,
      extra: true,
    });
    expect(parsed).toEqual({
      ...product,
      price: 1250,
      product_type_id: legacyGuid,
      product_subtype_id: null,
    });
    expect(productSchema.safeParse(product).success).toBe(true);
  });

  it.each([Infinity, "Infinity", -Infinity, "-Infinity"])(
    "rejects non-finite prices: %s",
    (price) => {
      const result = productSchema.safeParse({ ...product, price });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["price"] }));
      }
    },
  );

  it.each([
    ["title", "ab", "El título debe tener al menos 3 caracteres"],
    ["description", "short", "La descripción debe tener al menos 10 caracteres"],
    ["price", "0", "El precio debe ser mayor a 0"],
    ["category", "", "Seleccionar categoría"],
    ["image_urls", [], "Tenés que subir al menos 1 foto"],
  ])("preserves the %s validation message", (field, value, message) => {
    const result = productSchema.safeParse({ ...product, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [field], message }),
      );
    }
  });

  it("preserves the URL message and path, and accepts non-HTTP URLs as before", () => {
    const invalid = productSchema.safeParse({ ...product, image_urls: ["not a URL"] });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["image_urls", 0],
          message: "URL inválida",
        }),
      );
    }
    expect(
      productSchema.safeParse({ ...product, image_urls: ["mailto:shop@example.test"] }).success,
    ).toBe(true);
  });

  it.each([
    { price: "not a number" },
    { status: "draft" },
    { product_type_id: "not-a-uuid" },
    { product_subtype_id: "not-a-uuid" },
  ])("rejects invalid values: %j", (invalid) => {
    expect(productSchema.safeParse({ ...product, ...invalid }).success).toBe(false);
  });
});
