import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function EditProductPage({ params }: { params: Promise<{ slug: string }> }) {
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
    <div className="mx-auto flex w-full min-w-0 max-w-[896px] flex-col gap-[24px]">
      <div>
        <h1 className="font-sans text-[30px] font-normal leading-none">Editar Producto</h1>
        <p className="mt-[6px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink">
          Actualizá los detalles de {product.title}.
        </p>
      </div>
      <div className="min-w-0 rounded-none border border-midnight-ink bg-bone-white p-[13px] md:p-[24px]">
        {/* Pass fetched product as initialData and slug for updating */}
        <ProductForm initialData={product} editSlug={product.slug} />
      </div>
    </div>
  );
}
