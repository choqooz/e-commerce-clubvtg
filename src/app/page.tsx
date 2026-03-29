import { CatalogContent } from "@/components/catalog-content";
import { createClient } from "@/lib/supabase/server";
import { releaseExpiredReservations } from "@/lib/supabase/release-reservations";

export default async function HomePage() {
  // Lazy release: free any products reserved >15 min before querying
  await releaseExpiredReservations();

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
