import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCredits } from "@/lib/actions/credits";
import { TryOnPageContent } from "@/components/try-on/try-on-page-content";

async function getProduct(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productSlug: string }>;
}): Promise<Metadata> {
  const { productSlug } = await params;
  const product = await getProduct(productSlug);

  if (!product) {
    return { title: "Producto no encontrado" };
  }

  return {
    title: `Probate ${product.title} | ClubVTG`,
    description: `Probate ${product.title} con nuestra prueba virtual de prendas.`,
  };
}

export default async function TryOnPage({
  params,
}: {
  params: Promise<{ productSlug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    const { productSlug } = await params;
    redirect(`/sign-in?redirect_url=/try-on/${productSlug}`);
  }

  const { productSlug } = await params;
  const product = await getProduct(productSlug);

  if (!product) {
    notFound();
  }

  const creditsResult = await getUserCredits();
  const credits = creditsResult?.credits ?? 0;

  return (
    <TryOnPageContent
      product={product}
      initialCredits={credits}
    />
  );
}
