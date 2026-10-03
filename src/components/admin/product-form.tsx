"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { MultiImageUpload } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  getActiveProductTaxonomy,
  type ProductTaxonomyType,
} from "@/lib/actions/product";
import { productSchema, type ProductFormValues } from "@/lib/validations/product";

const NO_SUBTYPE_VALUE = "__none__";

function ProductFieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p
      id={id}
      className="flex items-start gap-[6px] border border-dotted border-midnight-ink bg-bone-white p-[6px] font-sans text-[15px] font-normal text-midnight-ink"
    >
      <CircleAlert aria-hidden="true" className="size-[16px] shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function ProductForm({
  initialData,
  editSlug,
}: {
  initialData?: Partial<ProductFormValues>;
  editSlug?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [taxonomy, setTaxonomy] = useState<ProductTaxonomyType[]>([]);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: initialData?.title || "",
      description: initialData?.description || "",
      price: initialData?.price || 0,
      category: initialData?.category || "",
      subcategory: initialData?.subcategory || "",
      image_urls: initialData?.image_urls || [],
      status: initialData?.status || "available",
      color: initialData?.color || "",
      size: initialData?.size || "",
      brand: initialData?.brand || "",
      condition: initialData?.condition || "",
      measurements: initialData?.measurements || "",
      product_type_id: initialData?.product_type_id,
      product_subtype_id: initialData?.product_subtype_id,
    },
  });
  const selectedType = taxonomy.find((type) => type.id === form.watch("product_type_id"));

  useEffect(() => {
    void getActiveProductTaxonomy().then((result) => {
      if ("data" in result) setTaxonomy(result.data);
    });
  }, []);

  async function onSubmit(data: ProductFormValues) {
    setIsPending(true);

    try {
      let result;
      if (editSlug) {
        // We need to import updateProduct at the top
        // or just rely on passing it, but let's assume it's imported (we'll fix import below)
        const { updateProduct } = await import("@/lib/actions/product");
        result = await updateProduct(editSlug, data);
      } else {
        result = await createProduct(data);
      }

      if ("error" in result) {
        toast.error("Error al guardar", { description: result.error });
      } else {
        toast.success(editSlug ? "Producto actualizado" : "Producto creado exitosamente");
        router.push("/admin/products");
      }
    } catch {
      toast.error("Ocurrió un error inesperado");
    } finally {
      setIsPending(false);
    }
  }

  // Simple quick error display
  const errors = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-[24px] bg-bone-white font-sans text-[15px] font-normal text-midnight-ink"
    >
      <div className="grid grid-cols-1 gap-[24px] md:grid-cols-3">
        {/* LEFT COLUMN - IMAGES */}
        <div className="space-y-[13px] md:col-span-1">
          <div
            role="group"
            aria-labelledby="product-images-label"
            aria-describedby={errors.image_urls ? "product-images-error" : undefined}
            className="space-y-[13px] border border-midnight-ink bg-warm-sand p-[13px]"
          >
            <Label id="product-images-label">Fotos del Producto</Label>
            <div>
              <MultiImageUpload
                value={form.watch("image_urls") || []}
                onChange={(urls) => form.setValue("image_urls", urls)}
                disabled={isPending}
              />
            </div>
            {errors.image_urls && (
              <ProductFieldError id="product-images-error" message={errors.image_urls.message} />
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - DATA */}
        <div className="space-y-[24px] md:col-span-2">
          {/* Section 1: Título, Descripción, Precio */}
          <div className="grid grid-cols-1 gap-[13px] border-t border-midnight-ink bg-warm-sand p-[13px] md:grid-cols-2">
            <div className="space-y-[13px]">
              <Label htmlFor="product-title">Título</Label>
              <Input
                id="product-title"
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "product-title-error" : undefined}
                {...form.register("title")}
                disabled={isPending}
                placeholder="Campera Denim Oversize"
              />
              {errors.title && (
                <ProductFieldError id="product-title-error" message={errors.title.message} />
              )}
            </div>

            <div className="space-y-[13px]">
              <Label htmlFor="product-price">Precio (ARS)</Label>
              <Input
                id="product-price"
                aria-invalid={!!errors.price}
                aria-describedby={errors.price ? "product-price-error" : undefined}
                type="number"
                {...form.register("price")}
                disabled={isPending}
                placeholder="45000"
              />
              {errors.price && (
                <ProductFieldError id="product-price-error" message={errors.price.message} />
              )}
            </div>
          </div>

          <div className="space-y-[13px] border-t border-midnight-ink p-[13px]">
            <Label htmlFor="product-description">Descripción</Label>
            <Textarea
              id="product-description"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "product-description-error" : undefined}
              {...form.register("description")}
              disabled={isPending}
              rows={4}
              placeholder="Detalles sobre la tela, estado, época..."
            />
            {errors.description && (
              <ProductFieldError
                id="product-description-error"
                message={errors.description.message}
              />
            )}
          </div>

          {/* Section 2: Categoría, Subcategoría */}
          <div className="grid grid-cols-1 gap-[13px] border-t border-midnight-ink bg-warm-sand p-[13px] md:grid-cols-2">
            <div className="space-y-[13px]">
              <Label htmlFor="product-category">Categoría</Label>
              <Select
                disabled={isPending}
                onValueChange={(id) => {
                  const type = taxonomy.find((item) => item.id === id);
                  form.setValue("product_type_id", id);
                  form.setValue("product_subtype_id", null);
                  form.setValue("category", type?.name ?? "");
                  form.setValue("subcategory", "");
                }}
                value={form.watch("product_type_id") ?? undefined}
              >
                <SelectTrigger
                  id="product-category"
                  aria-invalid={!!errors.category}
                  aria-describedby={errors.category ? "product-category-error" : undefined}
                >
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {taxonomy.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <ProductFieldError id="product-category-error" message={errors.category.message} />
              )}
            </div>

            <div className="space-y-[13px]">
              <Label htmlFor="product-subcategory">Subcategoría (Tipo)</Label>
              <Select
                disabled={isPending || !selectedType}
                onValueChange={(id) => {
                  if (id === NO_SUBTYPE_VALUE) {
                    form.setValue("product_subtype_id", null);
                    form.setValue("subcategory", "");
                    return;
                  }
                  const subtype = selectedType?.subtypes.find((item) => item.id === id);
                  form.setValue("product_subtype_id", id);
                  form.setValue("subcategory", subtype?.name ?? "");
                }}
                value={form.watch("product_subtype_id") ?? NO_SUBTYPE_VALUE}
              >
                <SelectTrigger
                  id="product-subcategory"
                  aria-invalid={!!errors.subcategory}
                  aria-describedby={errors.subcategory ? "product-subcategory-error" : undefined}
                >
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUBTYPE_VALUE}>Sin subtipo</SelectItem>
                  {selectedType?.subtypes.map((subtype) => (
                    <SelectItem key={subtype.id} value={subtype.id}>
                      {subtype.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.subcategory && (
                <ProductFieldError
                  id="product-subcategory-error"
                  message={errors.subcategory.message}
                />
              )}
            </div>
          </div>

          {/* Section 3: Marca, Condición, Talle, Color, Medidas */}
          <div className="grid grid-cols-1 gap-[13px] border-t border-midnight-ink p-[13px] md:grid-cols-2">
            <div className="space-y-[13px]">
              <Label htmlFor="product-brand">Marca</Label>
              <Input
                id="product-brand"
                aria-invalid={!!errors.brand}
                aria-describedby={errors.brand ? "product-brand-error" : undefined}
                {...form.register("brand")}
                disabled={isPending}
                placeholder="Levi's, Adidas, Sin marca"
              />
              {errors.brand && (
                <ProductFieldError id="product-brand-error" message={errors.brand.message} />
              )}
            </div>
            <div className="space-y-[13px]">
              <Label htmlFor="product-condition">Condición</Label>
              <Input
                id="product-condition"
                aria-invalid={!!errors.condition}
                aria-describedby={errors.condition ? "product-condition-error" : undefined}
                {...form.register("condition")}
                disabled={isPending}
                placeholder="10/10, Mint"
              />
              {errors.condition && (
                <ProductFieldError
                  id="product-condition-error"
                  message={errors.condition.message}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-[13px] border-t border-midnight-ink bg-warm-sand p-[13px] md:grid-cols-3">
            <div className="space-y-[13px]">
              <Label htmlFor="product-size">Talle</Label>
              <Input
                id="product-size"
                {...form.register("size")}
                disabled={isPending}
                placeholder="L, XL, 42"
              />
            </div>
            <div className="space-y-[13px]">
              <Label htmlFor="product-color">Color</Label>
              <Input
                id="product-color"
                {...form.register("color")}
                disabled={isPending}
                placeholder="Azul, Negro"
              />
            </div>
            <div className="space-y-[13px]">
              <Label htmlFor="product-measurements">Medidas (opcional)</Label>
              <Input
                id="product-measurements"
                {...form.register("measurements")}
                disabled={isPending}
                placeholder="Sisa a sisa: 60cm, Largo: 70cm"
              />
            </div>
          </div>

          {/* Section 4: Estado — solo en modo edición */}
          {editSlug && (
            <div className="space-y-[13px] border-t border-midnight-ink p-[13px]">
              <Label htmlFor="product-status">Estado</Label>
              <Select
                disabled={isPending}
                onValueChange={(val) => form.setValue("status", val as ProductFormValues["status"])}
                defaultValue={form.watch("status")}
              >
                <SelectTrigger
                  id="product-status"
                  aria-invalid={!!errors.status}
                  aria-describedby={errors.status ? "product-status-error" : undefined}
                >
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="archived">Archivado</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && (
                <ProductFieldError id="product-status-error" message={errors.status.message} />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-[13px] border-t border-midnight-ink pt-[24px]">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 aria-hidden="true" className="size-[16px] animate-spin" />}
          {editSlug ? "Actualizar Producto" : "Guardar Producto"}
        </Button>
      </div>
    </form>
  );
}
