import { CouponLifecycle } from "@/components/admin/coupon-lifecycle";
import { getAdminCoupons } from "@/lib/actions/coupon-admin";

export const metadata = { title: "Cupones | Admin ClubVTG" };

export default async function AdminCouponsPage() {
  const result = await getAdminCoupons();
  if ("error" in result) return <p className="text-sm text-destructive">{result.error}</p>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-heading font-medium tracking-wide">Cupones</h1><p className="mt-1 text-sm text-muted-foreground">Creá, desactivá y reemplazá códigos de uso limitado.</p></div>
      <CouponLifecycle coupons={result.data} />
    </div>
  );
}
