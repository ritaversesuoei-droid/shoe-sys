import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { classifyDay, holidayName, type DayClass } from "@/lib/holidays";

type SB = SupabaseClient<Database>;

// 1日の所定労働時間（残業算定の基準）の既定値。app_settings('payroll').regular_daily_min で上書き。
const DEFAULT_REGULAR_DAILY_MIN = 480; // 8h

export interface MonthlyDay {
  workDate: string;
  restraintMin: number;
  laborMin: number;
  nightMin: number;
  isWeekend: boolean;
  isHoliday: boolean;     // 休日区分（土日/祝日/手修正）
  holidayName: string | null;
}

export interface DriverMonthlySummary {
  driverId: string;
  driverCode: string | null;
  driverName: string;
  manageAttendance: boolean; // ① false=協力店社（勤怠集計・労働チェックの対象外＝打刻のみ）
  workDays: number;
  restraintMin: number;
  laborMin: number;
  nightMin: number;
  overtimeMin: number;
  holidayWorkMin: number;
  violationCount: number;
  byDay: MonthlyDay[];
}

function isWeekend(workDate: string): boolean {
  const d = new Date(`${workDate}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** app_settings から 所定労働時間 と 休日区分の手修正(overrides) を読む。 */
async function loadPayrollAndOverrides(
  sb: SB,
): Promise<{ regularDailyMin: number; overrides: Record<string, DayClass> }> {
  const { data } = await sb.from("app_settings").select("key, value").in("key", ["payroll", "holiday_overrides"]);
  let regularDailyMin = DEFAULT_REGULAR_DAILY_MIN;
  let overrides: Record<string, DayClass> = {};
  for (const row of data ?? []) {
    if (row.key === "payroll") {
      const v = row.value as { regular_daily_min?: number } | null;
      if (v && typeof v.regular_daily_min === "number") regularDailyMin = v.regular_daily_min;
    } else if (row.key === "holiday_overrides") {
      overrides = (row.value as Record<string, DayClass>) ?? {};
    }
  }
  return { regularDailyMin, overrides };
}

/**
 * 月次集計（仕様書 F-14）。ドライバー別に当月の確定勤務を集計し、日別詳細を展開する。
 * 残業=労働−所定(app_settings.payroll) の累計、休日労働=休日(土日/祝日/手修正)の労働、違反件数=compliance_alerts。
 */
export async function getMonthlySummary(
  sb: SB,
  monthKey: string,
  driverId?: string,
): Promise<DriverMonthlySummary[]> {
  const { regularDailyMin, overrides } = await loadPayrollAndOverrides(sb);

  let q = sb
    .from("shifts")
    .select("driver_id, work_date, restraint_min, labor_min, night_min, drivers(code, name, manage_attendance)")
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
    const driver = s.drivers as { code: string; name: string; manage_attendance: boolean } | null;
    let cur = map.get(s.driver_id);
    if (!cur) {
      cur = {
        driverId: s.driver_id,
        driverCode: driver?.code ?? null,
        driverName: driver?.name ?? "(不明)",
        manageAttendance: driver?.manage_attendance !== false,
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
    const holiday = classifyDay(s.work_date, overrides) === "holiday";
    cur.restraintMin += restraint;
    cur.laborMin += labor;
    cur.nightMin += night;
    cur.overtimeMin += Math.max(0, labor - regularDailyMin);
    if (holiday) cur.holidayWorkMin += labor;
    cur.byDay.push({
      workDate: s.work_date,
      restraintMin: restraint,
      laborMin: labor,
      nightMin: night,
      isWeekend: weekend,
      isHoliday: holiday,
      holidayName: holidayName(s.work_date),
    });
  }

  for (const v of map.values()) {
    v.workDays = new Set(v.byDay.map((d) => d.workDate)).size;
  }
  // ① 自社（勤怠管理対象）を上、協力店社（集計対象外・打刻のみ）を下にまとめる
  return Array.from(map.values()).sort((a, b) => {
    if (a.manageAttendance !== b.manageAttendance) return a.manageAttendance ? -1 : 1;
    return (a.driverCode ?? "").localeCompare(b.driverCode ?? "");
  });
}
