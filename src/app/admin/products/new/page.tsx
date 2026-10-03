import { ProductForm } from "@/components/admin/product-form";

export default function NewProductPage() {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[896px] flex-col gap-[24px]">
      <div>
        <h1 className="font-sans text-[30px] font-normal leading-none">Nuevo Producto</h1>
        <p className="mt-[6px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink">
          Completá los detalles de la prenda para publicarla en el catálogo de ClubVTG.
        </p>
      </div>
      <div className="min-w-0 rounded-none border border-midnight-ink bg-bone-white p-[13px] md:p-[24px]">
        <ProductForm />
      </div>
    </div>
  );
}
