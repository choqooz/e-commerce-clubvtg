import { CatalogContent } from "@/components/catalog-content";
import { releaseExpiredReservations } from "@/lib/supabase/release-reservations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Lazy release: free any products reserved >15 min before querying
  await releaseExpiredReservations();

  const supabase = await createClient();

  const { data: products } = await supabase
    .from("catalog_product_prices")
    .select("*")
    .eq("status", "available")
    .order("created_at", { ascending: false });

  let publicTypeNames: string[] = [];
  let typesLoadError = false;
  try {
    const { data: types, error } = await supabase
      .from("product_types")
      .select("name")
      .order("name");
    typesLoadError = Boolean(error);
    if (!error && Array.isArray(types)) {
      publicTypeNames = types.flatMap((row) =>
        typeof row?.name === "string" && row.name.trim() ? [row.name] : [],
      );
    }
  } catch {
    typesLoadError = true;
  }

  return (
    <CatalogContent
      initialProducts={products || []}
      publicTypeNames={publicTypeNames}
      typesLoadError={typesLoadError}
    />
  );
}
