"use server";

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productSchema, type ProductFormValues } from "@/lib/validations/product";

// Utility to generate a slug from the title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * Verify the current user is authenticated AND is an admin.
 * Returns an error object if unauthorized, or null if authorized.
 */
async function requireAdmin(): Promise<{ error: string } | null> {
  const { userId } = await auth();
  if (!userId) {
    return { error: "No autenticado. Iniciá sesión para continuar." };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("ADMIN_EMAIL env var is not configured");
    return { error: "Error de configuración del servidor." };
  }

  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  if (!primaryEmail || primaryEmail !== adminEmail) {
    return { error: "No tenés permisos de administrador." };
  }

  return null;
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
