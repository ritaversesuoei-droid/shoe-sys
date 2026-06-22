import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SB = SupabaseClient<Database>;

// 1日の所定労働時間（残業算定の基準）。TODO: app_settings 化（事業所の所定に合わせる）。
const REGULAR_DAILY_MIN = 480; // 8h

export interface MonthlyDay {
  workDate: string;
  restraintMin: number;
  laborMin: number;
  nightMin: number;
  isWeekend: boolean;
}

export interface DriverMonthlySummary {
  driverId: string;
  driverCode: string | null;
  driverName: string;
  workDays: number;
  restraintMin: number;
  laborMin: number;
  nightMin: number;
  overtimeMin: number;
  holidayWorkMin: number;
  violationCount: number;
  byDay: MonthlyDay[];
}

/** 土日判定（祝日連携は TODO: カレンダー連携で 法定休日 を反映）。 */
function isWeekend(workDate: string): boolean {
  const d = new Date(`${workDate}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/**
 * 月次集計（仕様書 F-14）。ドライバー別に当月の確定勤務を集計し、日別詳細を展開する。
 * 残業=労働−所定(480) の累計、休日労働=土日の労働（祝日連携はTODO）、違反件数=compliance_alerts。
 */
export async function getMonthlySummary(
  sb: SB,
  monthKey: string,
  driverId?: string,
): Promise<DriverMonthlySummary[]> {
  let q = sb
    .from("shifts")
    .select("driver_id, work_date, restraint_min, labor_min, night_min, drivers(code, name)")
    .eq("month_key", monthKey)
    .not("clock_out_at", "is", null)
    .order("work_date", { ascending: true });
  if (driverId) q = q.eq("driver_id", driverId);
  const { data: shifts, error } = await q;
  if (error) throw error;

  // 違反件数（compliance_alerts）
  let aq = sb.from("compliance_alerts").select("driver_id").eq("month_key", monthKey);
  if (driverId) aq = aq.eq("driver_id", driverId);
  const { data: alerts, error: aErr } = await aq;
  if (aErr) throw aErr;
  const alertCount = new Map<string, number>();
  for (const a of alerts ?? []) {
    alertCount.set(a.driver_id, (alertCount.get(a.driver_id) ?? 0) + 1);
  }

  const map = new Map<string, DriverMonthlySummary>();
  for (const s of shifts ?? []) {
    const driver = s.drivers as { code: string; name: string } | null;
    let cur = map.get(s.driver_id);
    if (!cur) {
      cur = {
        driverId: s.driver_id,
        driverCode: driver?.code ?? null,
        driverName: driver?.name ?? "(不明)",
        workDays: 0,
        restraintMin: 0,
        laborMin: 0,
        nightMin: 0,
        overtimeMin: 0,
        holidayWorkMin: 0,
        violationCount: alertCount.get(s.driver_id) ?? 0,
        byDay: [],
      };
      map.set(s.driver_id, cur);
    }
    const restraint = s.restraint_min ?? 0;
    const labor = s.labor_min ?? 0;
    const night = s.night_min ?? 0;
    const weekend = isWeekend(s.work_date);
    cur.restraintMin += restraint;
    cur.laborMin += labor;
    cur.nightMin += night;
    cur.overtimeMin += Math.max(0, labor - REGULAR_DAILY_MIN);
    if (weekend) cur.holidayWorkMin += labor;
    cur.byDay.push({ workDate: s.work_date, restraintMin: restraint, laborMin: labor, nightMin: night, isWeekend: weekend });
  }

  for (const v of map.values()) {
    v.workDays = new Set(v.byDay.map((d) => d.workDate)).size;
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.driverCode ?? "").localeCompare(b.driverCode ?? ""),
  );
}
