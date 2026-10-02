import { CouponLifecycle } from "@/components/admin/coupon-lifecycle";
import { getAdminCoupons } from "@/lib/actions/coupon-admin";

export const metadata = { title: "Cupones | Admin ClubVTG" };

export default async function AdminCouponsPage() {
  const result = await getAdminCoupons();
  if ("error" in result)
    return (
      <p className="rounded-none border border-dotted border-midnight-ink bg-bone-white p-[13px] font-sans text-[15px] font-normal text-midnight-ink">
        {result.error}
      </p>
    );
  return (
    <div className="flex min-w-0 flex-col gap-[24px]">
      <div>
        <h1 className="font-sans text-[30px] font-normal leading-none">Cupones</h1>
        <p className="mt-[6px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink">
          Creá, desactivá y reemplazá códigos de uso limitado.
        </p>
      </div>
      <CouponLifecycle coupons={result.data} />
    </div>
  );
}
