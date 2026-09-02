import { z } from "zod";

export const productSchema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres"),
  price: z.coerce.number().min(1, "El precio debe ser mayor a 0"),
  category: z.string().min(1, "Seleccionar categoría"),
  subcategory: z.string().optional(),
  image_urls: z.array(z.string().url("URL inválida")).min(1, "Tenés que subir al menos 1 foto"),
  status: z.enum(["available", "reserved", "sold", "archived"]),
  color: z.string().optional(),
  size: z.string().optional(),
  brand: z.string().optional(),
  condition: z.string().optional(),
  measurements: z.string().optional(), // For simplicity in the form, we'll store JSON string or text measurements
  product_type_id: z.string().uuid().nullable().optional(),
  product_subtype_id: z.string().uuid().nullable().optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;
