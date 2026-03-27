"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productSchema, type ProductFormValues } from "@/lib/validations/product";
import { requireAdmin } from "@/lib/actions/auth";

// Utility to generate a slug from the title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function createProduct(data: ProductFormValues) {
  const authError = await requireAdmin();
  if (authError) return authError;

  // Validate data
  const parsed = productSchema.safeParse(data);
  
  if (!parsed.success) {
    return { error: "Datos de producto inválidos", details: parsed.error.flatten() };
  }

  const payload = parsed.data;
  const slug = generateSlug(payload.title);

  // Check if slug exists to avoid unique constraint errors
  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("slug", slug)
    .single();

  const finalSlug = existing ? `${slug}-${Date.now().toString().slice(-4)}` : slug;

  const { error } = await supabaseAdmin.from("products").insert({
    ...payload,
    slug: finalSlug,
  });

  if (error) {
    console.error("Error creating product:", error);
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/products");
  
  return { success: true, slug: finalSlug };
}

export async function updateProduct(slug: string, data: ProductFormValues) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const parsed = productSchema.safeParse(data);
  if (!parsed.success) return { error: "Datos inválidos" };

  const { error } = await supabaseAdmin
    .from("products")
    .update(parsed.data)
    .eq("slug", slug);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/products");
  revalidatePath(`/product/${slug}`);
  
  return { success: true };
}

export async function deleteProduct(slug: string) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { error } = await supabaseAdmin
    .from("products")
    .delete()
    .eq("slug", slug);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: true };
}
