import { ProductForm } from "@/components/admin/product-form";

export default function NewProductPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-medium tracking-wide">Nuevo Producto</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Completá los detalles de la prenda para publicarla en el catálogo de ClubVTG.
        </p>
      </div>
      <div className="bg-background border rounded-lg p-6 shadow-sm">
        <ProductForm />
      </div>
    </div>
  );
}
