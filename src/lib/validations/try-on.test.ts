import { describe, expect, it } from "vitest";
import { creditPackSchema, tryOnImageSchema } from "./try-on";

const image = (type: string, bytes = 1) => new File([new Uint8Array(bytes)], "image", { type });

describe("tryOnImageSchema", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    const file = image(type);
    expect(tryOnImageSchema.parse({ productSlug: "jacket", image: file })).toEqual({
      productSlug: "jacket",
      image: file,
    });
  });

  it("accepts a file at the size boundary and rejects one byte above it", () => {
    expect(
      tryOnImageSchema.safeParse({
        productSlug: "jacket",
        image: image("image/jpeg", 10 * 1024 * 1024),
      }).success,
    ).toBe(true);
    const result = tryOnImageSchema.safeParse({
      productSlug: "jacket",
      image: image("image/jpeg", 10 * 1024 * 1024 + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toBe("La imagen no puede superar 10MB");
  });

  it("preserves the messages for a missing product and unsupported type", () => {
    const result = tryOnImageSchema.safeParse({ productSlug: "", image: image("image/gif") });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["productSlug"], message: "Producto requerido" }),
          expect.objectContaining({
            path: ["image"],
            message: "Formato no soportado. Usá JPG, PNG o WebP",
          }),
        ]),
      );
    }
  });

  it("rejects a non-File image", () => {
    expect(tryOnImageSchema.safeParse({ productSlug: "jacket", image: "image" }).success).toBe(
      false,
    );
  });
});

describe("creditPackSchema", () => {
  it.each(["basic", "popular", "pro"])("accepts %s", (pack) => {
    expect(creditPackSchema.parse(pack)).toBe(pack);
  });

  it("rejects other values", () => {
    expect(creditPackSchema.safeParse("premium").success).toBe(false);
  });
});
