import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { AdminSidebar } from "@/components/admin/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  // Protect admin routes: only the designated ADMIN_EMAIL can access
  if (!primaryEmail || primaryEmail !== process.env.ADMIN_EMAIL) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen bg-muted/40 font-sans">
      <AdminSidebar />
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
