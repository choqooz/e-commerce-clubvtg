import { CatalogContent } from "@/components/catalog-content";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("status", "available")
    .order("created_at", { ascending: false });

  return (
    <CatalogContent initialProducts={products || []} />
  );
}
