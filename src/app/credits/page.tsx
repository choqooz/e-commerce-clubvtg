import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditsPageContent } from "@/components/credits/credits-page-content";
import { getUserCredits } from "@/lib/actions/credits";

export const metadata: Metadata = {
  title: "Créditos | ClubVTG",
  description: "Comprá créditos para usar la prueba virtual de prendas.",
};

export default async function CreditsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/credits");
  }

  const creditsResult = await getUserCredits();
  const credits = creditsResult?.credits ?? 0;

  return <CreditsPageContent initialCredits={credits} />;
}
