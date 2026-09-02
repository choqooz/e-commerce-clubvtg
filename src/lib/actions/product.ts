"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/actions/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productSchema, type ProductFormValues } from "@/lib/validations/product";

export interface ProductTaxonomySubtype {
  id: string;
  name: string;
  product_type_id: string;
}

export interface ProductTaxonomyType {
  id: string;
  name: string;
  subtypes: ProductTaxonomySubtype[];
}

const TAXONOMY_KIND = { TYPE: "type", SUBTYPE: "subtype" } as const;
type TaxonomyKind = (typeof TAXONOMY_KIND)[keyof typeof TAXONOMY_KIND];

export async function getActiveProductTaxonomy(): Promise<{ data: ProductTaxonomyType[] } | { error: string }> {
  const authError = await requireAdmin();
  if (authError) return authError;

  const [typesResult, subtypesResult] = await Promise.all([
    supabaseAdmin.from("product_types").select("id, name").eq("is_active", true).order("name"),
    supabaseAdmin.from("product_subtypes").select("id, name, product_type_id").eq("is_active", true).order("name"),
  ]);
  if (typesResult.error || subtypesResult.error) {
    return { error: typesResult.error?.message ?? subtypesResult.error?.message ?? "No se pudo cargar la taxonomía" };
  }

  const subtypes = (subtypesResult.data ?? []) as ProductTaxonomySubtype[];
  return {
    data: ((typesResult.data ?? []) as Omit<ProductTaxonomyType, "subtypes">[]).map((type) => ({
      ...type,
      subtypes: subtypes.filter((subtype) => subtype.product_type_id === type.id),
    })),
  };
}

export async function createProductTaxonomyType(name: string) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { data, error } = await supabaseAdmin.rpc("create_product_taxonomy_type", { p_name: name });
  return error ? { error: error.message } : { data };
}

export async function createProductTaxonomySubtype(typeId: string, name: string) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { data, error } = await supabaseAdmin.rpc("create_product_taxonomy_subtype", { p_name: name, p_type_id: typeId });
  return error ? { error: error.message } : { data };
}

export async function setProductTaxonomyActive(kind: TaxonomyKind, id: string, isActive: boolean) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { error } = await supabaseAdmin.rpc("set_product_taxonomy_active", { p_id: id, p_is_active: isActive, p_kind: kind });
  return error ? { error: error.message } : { success: true };
}

export async function deleteProductTaxonomy(kind: TaxonomyKind, id: string) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const table = kind === TAXONOMY_KIND.TYPE ? "product_types" : "product_subtypes";
  const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
  return error ? { error: error.message } : { success: true };
}

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

  const { error } = await supabaseAdmin.from("products").update(parsed.data).eq("slug", slug);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/products");
  revalidatePath(`/product/${slug}`);

  return { success: true };
}

export async function deleteProduct(slug: string) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { error } = await supabaseAdmin.from("products").delete().eq("slug", slug);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: true };
}
