"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { productSchema, type ProductFormValues } from "@/lib/validations/product";
import { createProduct } from "@/lib/actions/product";
import { MultiImageUpload } from "@/components/admin/image-upload";
import { CATEGORIES } from "@/lib/config"; // Need to import or define categories

// Use a simple fallback if CATEGORIES is not exported perfectly
const adminCats = [
  { id: "Tops", name: "Tops" },
  { id: "Bottoms", name: "Bottoms" },
  { id: "Outerwear", name: "Outerwear" },
  { id: "Accesorios", name: "Accesorios" }
];

export function ProductForm({ 
  initialData,
  editSlug 
}: { 
  initialData?: Partial<ProductFormValues>,
  editSlug?: string
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

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
    },
  });

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
      
      if ('error' in result) {
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN - IMAGES */}
        <div className="md:col-span-1 space-y-4">
          <div>
            <Label>Fotos del Producto</Label>
            <div className="mt-2">
              <MultiImageUpload
                value={form.watch("image_urls") || []}
                onChange={(urls) => form.setValue("image_urls", urls)}
                disabled={isPending}
              />
            </div>
            {errors.image_urls && <p className="text-destructive text-sm mt-1">{errors.image_urls.message}</p>}
          </div>
        </div>

        {/* RIGHT COLUMN - DATA */}
        <div className="md:col-span-2 space-y-6">

          {/* Section 1: Título, Descripción, Precio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input {...form.register("title")} disabled={isPending} placeholder="Campera Denim Oversize" />
              {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Precio (ARS)</Label>
              <Input type="number" {...form.register("price")} disabled={isPending} placeholder="45000" />
              {errors.price && <p className="text-destructive text-sm">{errors.price.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea 
              {...form.register("description")} 
              disabled={isPending} 
              rows={4}
              placeholder="Detalles sobre la tela, estado, época..." 
            />
            {errors.description && <p className="text-destructive text-sm">{errors.description.message}</p>}
          </div>

          {/* Section 2: Categoría, Subcategoría */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select 
                disabled={isPending} 
                onValueChange={(val) => form.setValue("category", val)} 
                defaultValue={form.watch("category")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {adminCats.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-destructive text-sm">{errors.category.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Subcategoría (Tipo)</Label>
              <Input {...form.register("subcategory")} disabled={isPending} placeholder="Ej: Campera de Jean" />
              {errors.subcategory && <p className="text-destructive text-sm">{errors.subcategory.message}</p>}
            </div>
          </div>

          {/* Section 3: Marca, Condición, Talle, Color, Medidas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Marca</Label>
              <Input {...form.register("brand")} disabled={isPending} placeholder="Levi's, Adidas, Sin marca" />
              {errors.brand && <p className="text-destructive text-sm">{errors.brand.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Condición</Label>
              <Input {...form.register("condition")} disabled={isPending} placeholder="10/10, Mint" />
              {errors.condition && <p className="text-destructive text-sm">{errors.condition.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Talle</Label>
              <Input {...form.register("size")} disabled={isPending} placeholder="L, XL, 42" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input {...form.register("color")} disabled={isPending} placeholder="Azul, Negro" />
            </div>
            <div className="space-y-2">
              <Label>Medidas (opcional)</Label>
              <Input {...form.register("measurements")} disabled={isPending} placeholder="Sisa a sisa: 60cm, Largo: 70cm" />
            </div>
          </div>

          {/* Section 4: Estado — solo en modo edición */}
          {editSlug && (
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                disabled={isPending}
                onValueChange={(val) => form.setValue("status", val as ProductFormValues["status"])}
                defaultValue={form.watch("status")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="archived">Archivado</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && <p className="text-destructive text-sm">{errors.status.message}</p>}
            </div>
          )}

        </div>
      </div>

      <div className="flex justify-end border-t pt-6 gap-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editSlug ? "Actualizar Producto" : "Guardar Producto"}
        </Button>
      </div>
    </form>
  );
}
