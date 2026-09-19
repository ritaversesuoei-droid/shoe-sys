import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, handle } from "@/lib/api/response";
import { saveFuelLog, FUEL_LIMITS } from "@/lib/operations/fuel";

/**
 * POST /api/fuel  給油記録の保存（走行距離・今回燃費はサーバー計算）。
 *   body: { vehicle_no, station, odometer, liters, is_full }
 *   本人はセッションで確定。車両横断のODD参照が要るため service_role で計算・保存。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await getSessionContext();
    if (!ctx || !ctx.driverId) return fail("ログインが必要です", 401);

    const body = (await request.json()) as {
      vehicle_no?: string;
      station?: string | null;
      odometer?: number;
      liters?: number;
      is_full?: boolean;
    };
    const vehicleNo = String(body.vehicle_no ?? "").trim();
    const odometer = Number(body.odometer);
    const liters = Number(body.liters);
    const isFull = body.is_full === true;
    if (!vehicleNo) return fail("車両番号は必須です", 400);
    if (!Number.isFinite(odometer) || odometer <= 0) return fail("オドメーターが不正です", 400);
    if (!Number.isFinite(liters) || liters <= 0) return fail("給油量が不正です", 400);
    if (liters > FUEL_LIMITS.maxLitersStat) return fail("給油量が上限を超えています", 400);

    const admin = createAdminClient();
    const { data: drv } = await admin
      .from("drivers")
      .select("code, name, default_vehicle_no")
      .eq("id", ctx.driverId)
      .maybeSingle();

    const result = await saveFuelLog(admin, {
      driverId: ctx.driverId,
      driverCode: drv?.code ?? null,
      driverName: drv?.name ?? ctx.displayName ?? null,
      vehicleNo,
      station: body.station ? String(body.station).trim() : null,
      odometer,
      liters,
      isFull,
    });

    return ok({ fuel_km_l: result.fuelKmL, delta_km: result.deltaKm, is_full: result.isFull });
  });
}
