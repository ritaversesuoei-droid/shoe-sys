import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { to_month_key } from "@/lib/datekey";

type SB = SupabaseClient<Database>;

/**
 * 燃費（給油記録）ロジック。現行GAS `saveData` / `generateMonthlySummary` を忠実移植。
 *   - 走行距離 = 今回ODD − 同一車両の直前給油ODD
 *   - 今回燃費（満タン時のみ）= 前回満タン→今回のODD差 ÷ 前回満タン以降の給油量合計（つなぎ合算）
 *   - 月間燃費 = 当月の走行距離合計 ÷ 給油量合計、基準との差 = 月間燃費 − 目標燃費
 *   - プライズ = 基礎(ランク①〜⑤/0⃣) ＋ 変動(差に連動)
 *
 * サーバー側で計算し fuel_logs に delta_km / fuel_km_l を保存する（GASと同じ挙動）。
 */

// 送信可否の閾値（フロントと共有）。逆転/2500km/600L は送信不可、集計は 5000km/2000L でガード。
export const FUEL_LIMITS = {
  maxDeltaKmSend: 2500, // これ以上は送信不可（メーター誤入力）
  maxLitersSend: 600, // これ以上は送信不可
  maxDeltaKmStat: 5000, // 集計に含める上限
  maxLitersStat: 2000,
} as const;

export interface PriorFill {
  odometer: number;
  liters: number;
  isFull: boolean;
}

/**
 * 走行距離・今回燃費を算出（純関数・GAS saveData と同一ロジック）。
 * @param prior 同一車両の過去給油（occurred_at 降順＝新しい順）
 */
export function computeFuel(
  prior: PriorFill[],
  odometer: number,
  liters: number,
  isFull: boolean,
): { deltaKm: number; fuelKmL: number | null } {
  let prevOdo: number | null = null;
  let prevFullOdo: number | null = null;
  let accumulatedLiters = liters; // 今回の給油量を初期値

  for (const r of prior) {
    if (prevOdo === null && Number.isFinite(r.odometer)) prevOdo = r.odometer;
    if (isFull) {
      if (!r.isFull) {
        // つなぎ給油: 前回満タンまでの給油量を合算
        accumulatedLiters += r.liters;
      } else {
        // 満タン給油に到達 → 前回満タンODDを確定して終了
        prevFullOdo = r.odometer;
        break;
      }
    } else {
      break; // つなぎ給油は直前ODDのみ参照
    }
  }

  const deltaKm = prevOdo !== null && odometer > prevOdo ? odometer - prevOdo : 0;

  let fuelKmL: number | null = null;
  if (isFull && accumulatedLiters > 0) {
    const totalTripKm = prevFullOdo !== null && odometer > prevFullOdo ? odometer - prevFullOdo : deltaKm;
    if (totalTripKm > 0) fuelKmL = Math.round((totalTripKm / accumulatedLiters) * 100) / 100;
  }
  return { deltaKm, fuelKmL };
}

/** P/Wランク → 基礎プライズ。 */
export function basePrizeOf(rank: string | null | undefined): number {
  switch ((rank ?? "").trim()) {
    case "①": return 5000;
    case "②": return 6000;
    case "③": return 7000;
    case "④": return 8000;
    case "⑤": return 9000;
    case "0⃣": return 3000;
    default: return 0;
  }
}

/** 変動プライズ（GAS generateMonthlySummary の式）。diff=当月燃費−目標燃費。 */
export function flexPrizeOf(diff: number): number {
  if (!(diff > 0)) return 0;
  const points = Math.floor(Math.round(diff * 100)); // 0.52→52
  return diff >= 0.1 ? 2000 + points * 100 : points * 100;
}

/** レンジ外（正常燃費）判定。管理レポートの赤ハイライト用。 */
export function isOutOfNormal(fuelKmL: number | null, min: number | null, max: number | null): boolean {
  if (fuelKmL == null) return false;
  if (min != null && fuelKmL < min) return true;
  if (max != null && fuelKmL > max) return true;
  return false;
}

// テーブル未作成（マイグレーション未適用）を吸収するためのガード。
function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "42P01" || /relation .*fuel_logs.* does not exist/i.test(e?.message ?? "");
}

export interface FuelInput {
  driverId: string;
  driverCode: string | null;
  driverName: string | null;
  vehicleNo: string;
  station: string | null;
  odometer: number;
  liters: number;
  isFull: boolean;
  occurredAt?: string;
}

export interface FuelSaveResult {
  id: string;
  deltaKm: number;
  fuelKmL: number | null;
  isFull: boolean;
}

/** 給油記録の保存（走行距離・今回燃費をサーバー計算して記録）。sb は service_role 推奨（車両横断のODD参照のため）。 */
export async function saveFuelLog(sb: SB, input: FuelInput): Promise<FuelSaveResult> {
  // 同一車両の直近履歴（前回満タンに到達できるだけ遡れば十分）
  const { data: prior, error } = await sb
    .from("fuel_logs")
    .select("odometer, liters, is_full")
    .eq("vehicle_no", input.vehicleNo)
    .order("occurred_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const { deltaKm, fuelKmL } = computeFuel(
    (prior ?? []).map((r) => ({ odometer: Number(r.odometer), liters: Number(r.liters), isFull: r.is_full })),
    input.odometer,
    input.liters,
    input.isFull,
  );

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const { data: inserted, error: insErr } = await sb
    .from("fuel_logs")
    .insert({
      occurred_at: occurredAt,
      driver_id: input.driverId,
      driver_code: input.driverCode,
      driver_name: input.driverName,
      vehicle_no: input.vehicleNo,
      station: input.station,
      odometer: input.odometer,
      liters: input.liters,
      is_full: input.isFull,
      fuel_km_l: fuelKmL,
      delta_km: deltaKm,
      month_key: to_month_key(occurredAt),
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw insErr ?? new Error("給油記録の保存に失敗しました");

  return { id: inserted.id, deltaKm, fuelKmL, isFull: input.isFull };
}

export interface FuelInitialData {
  targetFuel: number;
  baseVehicle: string | null;
  lastOdoMap: Record<string, number>;
  vehicleList: string[];
  monthFuel: number;
  fuelDiff: number;
  periodSuccess: number;
  ready: boolean; // fuel_logs テーブルが存在するか（未適用なら false）
}

/**
 * ドライバー給油画面の初期データ（GAS getInitialData のドライバー版）。
 * 車両横断のODD/一覧が要るため sb は service_role で呼ぶこと（サーバーで集約し安全な値のみ返す）。
 */
export async function getFuelInitialData(
  sb: SB,
  driver: { id: string; default_vehicle_no: string | null; target_fuel_km_l: number | null },
): Promise<FuelInitialData> {
  const baseVehicle = driver.default_vehicle_no ?? null;
  const targetFuel = Number(driver.target_fuel_km_l ?? 0);

  // 車両一覧（候補）＝全ドライバーの基本車番
  const vehicleSet = new Set<string>();
  const { data: drv } = await sb.from("drivers").select("default_vehicle_no").not("default_vehicle_no", "is", null);
  for (const d of drv ?? []) if (d.default_vehicle_no) vehicleSet.add(String(d.default_vehicle_no).trim());

  const empty: FuelInitialData = {
    targetFuel,
    baseVehicle,
    lastOdoMap: {},
    vehicleList: [...vehicleSet].sort(),
    monthFuel: 0,
    fuelDiff: 0,
    periodSuccess: 0,
    ready: true,
  };

  try {
    // 車両ごとの最新ODD（新しい順に走査して初出＝最新）
    const { data: logs, error } = await sb
      .from("fuel_logs")
      .select("vehicle_no, odometer, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    const lastOdoMap: Record<string, number> = {};
    for (const l of logs ?? []) {
      const v = String(l.vehicle_no).trim();
      if (v && lastOdoMap[v] === undefined) lastOdoMap[v] = Number(l.odometer);
      vehicleSet.add(v);
    }

    // 本人の基本車両・当月（最新データ月）の平均燃費・達成回数
    let monthFuel = 0;
    let periodSuccess = 0;
    if (baseVehicle) {
      const { data: mine } = await sb
        .from("fuel_logs")
        .select("month_key, delta_km, liters, is_full, fuel_km_l")
        .eq("vehicle_no", baseVehicle)
        .order("occurred_at", { ascending: false })
        .limit(500);
      const rows = mine ?? [];
      const latestMonth = rows[0]?.month_key ?? to_month_key(new Date());
      let dist = 0;
      let liters = 0;
      for (const r of rows) {
        if (r.month_key !== latestMonth) continue;
        const dk = Number(r.delta_km);
        const lt = Number(r.liters);
        if (dk > 0 && dk < FUEL_LIMITS.maxDeltaKmStat) dist += dk;
        if (lt > 0 && lt <= FUEL_LIMITS.maxLitersStat) liters += lt;
        if (r.is_full && r.fuel_km_l != null && Number(r.fuel_km_l) >= targetFuel && targetFuel > 0) periodSuccess += 1;
      }
      if (dist > 0 && liters > 0) monthFuel = Math.round((dist / liters) * 100) / 100;
    }
    const fuelDiff = monthFuel > 0 ? Math.round((monthFuel - targetFuel) * 100) / 100 : 0;

    return {
      targetFuel,
      baseVehicle,
      lastOdoMap,
      vehicleList: [...vehicleSet].sort(),
      monthFuel,
      fuelDiff,
      periodSuccess,
      ready: true,
    };
  } catch (e) {
    if (isMissingTable(e)) return { ...empty, ready: false };
    throw e;
  }
}
