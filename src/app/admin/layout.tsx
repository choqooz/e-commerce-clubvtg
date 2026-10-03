import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { ADMIN_EMAIL } from "@/lib/config.server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  )?.emailAddress;

  // Protect admin routes: only the designated ADMIN_EMAIL can access
  if (!primaryEmail || primaryEmail !== ADMIN_EMAIL) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen bg-bone-white font-sans font-normal text-midnight-ink">
      <AdminSidebar />
      <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 overflow-y-auto p-[18px] md:p-[30px]">
        {children}
      </main>
    </div>
  );
}
