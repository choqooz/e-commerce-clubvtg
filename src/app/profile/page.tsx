import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfilePageContent } from "@/components/profile/profile-page-content";
import { getUserCredits, getTryOnHistory } from "@/lib/actions/credits";

export const metadata: Metadata = {
  title: "Mi Perfil | ClubVTG",
  description: "Tu perfil y configuración de cuenta en ClubVTG.",
};

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/profile");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/profile");
  }

  const [creditsResult, tryOnHistory] = await Promise.all([getUserCredits(), getTryOnHistory()]);
  const credits = creditsResult?.credits ?? 0;

  const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);

  return (
    <ProfilePageContent
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: primaryEmail?.emailAddress ?? "",
        imageUrl: user.imageUrl,
        emailVerified: primaryEmail?.verification?.status === "verified",
      }}
      credits={credits}
      tryOnHistory={tryOnHistory}
    />
  );
}
