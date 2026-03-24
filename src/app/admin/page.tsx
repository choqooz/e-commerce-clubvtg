import { redirect } from "next/navigation";

export default function AdminDashboard() {
  // Redirect to products as the main admin landing page
  redirect("/admin/products");
}
