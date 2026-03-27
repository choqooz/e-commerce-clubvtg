import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const tryOnImageSchema = z.object({
  productSlug: z.string().min(1, "Producto requerido"),
  image: z
    .instanceof(File)
    .refine((f) => f.size <= MAX_FILE_SIZE, "La imagen no puede superar 10MB")
    .refine(
      (f) => ACCEPTED_IMAGE_TYPES.includes(f.type),
      "Formato no soportado. Usá JPG, PNG o WebP"
    ),
});

export const creditPackSchema = z.enum(["basic", "popular", "pro"]);

export type TryOnImageInput = z.infer<typeof tryOnImageSchema>;
