import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch the product
  const { data: product, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !product) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-medium tracking-wide">Editar Producto</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Actualizá los detalles de {product.title}.
        </p>
      </div>
      <div className="bg-background border rounded-lg p-6 shadow-sm">
        {/* Pass fetched product as initialData and slug for updating */}
        <ProductForm initialData={product} editSlug={product.slug} />
      </div>
    </div>
  );
}
