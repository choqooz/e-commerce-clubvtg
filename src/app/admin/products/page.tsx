import { Plus, Edit } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function AdminProductsPage() {
  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching products:", error);
  }

  return (
    <div className="flex min-w-0 flex-col gap-[24px]">
      <div className="flex flex-col items-start justify-between gap-[18px] sm:flex-row sm:items-center">
        <div>
          <h1 className="font-sans text-[30px] font-normal leading-none">Productos</h1>
          <p className="mt-[6px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink">
            Administrá el catálogo de prendas vintage ({products?.length || 0} en total).
          </p>
        </div>
        <Button asChild>
          <Link
            href="/admin/products/new"
            className="gap-[6px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          >
            <Plus className="h-[16px] w-[16px]" />
            Nuevo Producto
          </Link>
        </Button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-none border border-midnight-ink bg-bone-white">
        <table className="w-full min-w-[720px] text-left font-sans text-[15px] font-normal">
          <thead className="border-b border-midnight-ink bg-warm-sand">
            <tr>
              <th className="px-[13px] py-[13px] font-mono text-[13px] font-normal text-midnight-ink">
                Producto
              </th>
              <th className="px-[13px] py-[13px] font-mono text-[13px] font-normal text-midnight-ink">
                Precio
              </th>
              <th className="px-[13px] py-[13px] font-mono text-[13px] font-normal text-midnight-ink">
                Estado
              </th>
              <th className="px-[13px] py-[13px] font-mono text-[13px] font-normal text-midnight-ink">
                Categoría
              </th>
              <th className="px-[13px] py-[13px] text-right font-mono text-[13px] font-normal text-midnight-ink">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-midnight-ink">
            {products?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-[13px] py-[24px] text-center text-midnight-ink">
                  No hay productos cargados todavía.
                </td>
              </tr>
            ) : (
              products?.map((product) => (
                <tr key={product.id} className="hover:bg-warm-sand">
                  <td className="px-[13px] py-[13px]">
                    <div className="flex items-center gap-[13px]">
                      <div className="relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-none bg-warm-sand">
                        {product.image_urls && product.image_urls.length > 0 ? (
                          <Image
                            src={product.image_urls[0]}
                            alt={product.title}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="font-sans text-[15px] font-normal text-midnight-ink">
                          {product.title}
                        </p>
                        <p className="font-mono text-[13px] font-normal text-midnight-ink">
                          {product.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-[13px] py-[13px]">${product.price.toLocaleString("es-AR")}</td>
                  <td className="px-[13px] py-[13px]">
                    <span
                      className={`inline-flex items-center rounded-none border border-midnight-ink px-[6px] py-[2px] font-mono text-[13px] font-normal text-midnight-ink ${
                        product.status === "available"
                          ? "bg-bone-white"
                          : product.status === "sold"
                            ? "bg-warm-sand"
                            : "bg-bone-white border-dotted"
                      }`}
                    >
                      {product.status}
                    </span>
                  </td>
                  <td className="px-[13px] py-[13px]">
                    <span className="text-midnight-ink">{product.category}</span>
                  </td>
                  <td className="px-[13px] py-[13px] text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        href={`/admin/products/${product.slug}/edit`}
                        className="focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
                      >
                        <Edit className="h-[16px] w-[16px] text-midnight-ink" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
