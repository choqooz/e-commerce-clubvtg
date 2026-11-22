import { describe, expect, it } from "vitest";
import { checkoutItemsSchema, checkoutSchema } from "./checkout";

const checkout = {
  fullName: "Ada Example",
  email: "ada@example.test",
  dni: "12345678",
  phone: "12345678",
  street: "Example",
  number: "1",
  city: "City",
  province: "Province",
  zipCode: "1234",
};
const id = "123e4567-e89b-42d3-a456-426614174000";
const legacyGuid = "01234567-89ab-cdef-0123-456789abcdef";

describe("checkoutSchema", () => {
  it("accepts valid fields, strips unknown fields, and preserves the optional apartment", () => {
    expect(checkoutSchema.parse({ ...checkout, floorOrApt: "2A", extra: true })).toEqual({
      ...checkout,
      floorOrApt: "2A",
    });
    expect(checkoutSchema.safeParse(checkout).success).toBe(true);
  });

  it.each([
    ["fullName", "ab", "El nombre completo es requerido"],
    ["email", "bad-email", "Email inválido"],
    ["dni", "123456", "El DNI es inválido"],
    ["dni", "1234567890", "El DNI es inválido"],
    ["phone", "1234567", "Teléfono inválido"],
    ["street", "ab", "La calle es requerida"],
    ["number", "", "El número es requerido"],
    ["city", "a", "La ciudad es requerida"],
    ["province", "a", "La provincia es requerida"],
    ["zipCode", "123", "Código postal requerido"],
  ])("preserves the %s validation message", (field, value, message) => {
    const result = checkoutSchema.safeParse({ ...checkout, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [field], message }),
      );
    }
  });
});

describe("checkoutItemsSchema", () => {
  it("accepts one of each product, including GUIDs accepted by the existing schema", () => {
    const items = [
      { product: { id }, quantity: 1 },
      { product: { id: legacyGuid }, quantity: 1 },
    ];
    expect(checkoutItemsSchema.parse(items)).toEqual(items);
  });

  it("preserves the empty cart and invalid product messages", () => {
    const empty = checkoutItemsSchema.safeParse([]);
    expect(empty.success).toBe(false);
    if (!empty.success)
      expect(empty.error.issues[0]?.message).toBe("El carrito no puede estar vacío");

    const invalid = checkoutItemsSchema.safeParse([{ product: { id: "invalid" }, quantity: 1 }]);
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues).toContainEqual(
        expect.objectContaining({
          path: [0, "product", "id"],
          message: "ID de producto inválido",
        }),
      );
    }
  });

  it.each([0, 2, "1", null, undefined])(
    "rejects quantity %s with the existing message",
    (quantity) => {
      const result = checkoutItemsSchema.safeParse([{ product: { id }, quantity }]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: [0, "quantity"],
            message: "Cada producto debe tener cantidad uno",
          }),
        );
      }
    },
  );

  it("rejects repeated products at the duplicate item's id", () => {
    const result = checkoutItemsSchema.safeParse([
      { product: { id }, quantity: 1 },
      { product: { id }, quantity: 1 },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: [1, "product", "id"],
          message: "Cada producto debe aparecer una vez",
        }),
      );
    }
  });
});
