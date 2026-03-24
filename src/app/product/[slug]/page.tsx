import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailContent } from "@/components/product-detail-content";
import { createClient } from "@/lib/supabase/server";

async function getProduct(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return { title: "Producto no encontrado" };
  }

  return {
    title: product.title,
    description: product.description ?? `${product.title} — Club VTG`,
    openGraph: {
      title: product.title,
      description: product.description ?? `${product.title} — Club VTG`,
      images:
        product.image_urls && product.image_urls.length > 0
          ? [{ url: product.image_urls[0] }]
          : [],
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  // 2. Fetch related products (same category, different id, available)
  const supabase = await createClient();
  const { data: relatedProducts } = await supabase
    .from("products")
    .select("*")
    .eq("category", product.category)
    .eq("status", "available")
    .neq("id", product.id)
    .limit(4);

  return <ProductDetailContent product={product} relatedProducts={relatedProducts || []} />;
}
