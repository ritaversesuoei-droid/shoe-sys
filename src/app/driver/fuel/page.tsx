import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFuelInitialData } from "@/lib/operations/fuel";
import { FuelForm } from "@/components/driver/FuelForm";

export const dynamic = "force-dynamic";

/** 給油記録（現行GAS「DIESEL PUMP LOG」の移植・同デザイン/同仕様）。 */
export default async function FuelPage() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.driverId) redirect("/driver");

  // 車両横断のODD/一覧・本人成績を集約するため service_role で取得（安全な派生値のみ渡す）
  const admin = createAdminClient();
  const { data: drv } = await admin
    .from("drivers")
    .select("id, name, code, default_vehicle_no, target_fuel_km_l")
    .eq("id", ctx.driverId)
    .maybeSingle();

  const initial = await getFuelInitialData(admin, {
    id: ctx.driverId,
    default_vehicle_no: drv?.default_vehicle_no ?? null,
    target_fuel_km_l: drv?.target_fuel_km_l ?? null,
  });

  return <FuelForm driverName={drv?.name ?? ctx.displayName ?? "ドライバー"} initial={initial} />;
}
