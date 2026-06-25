import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { loadComplianceConfig, calcShiftMetrics, judgeShift } from "@/lib/compliance";

type SB = SupabaseClient<Database>;

/** interval文字列("HH:MM:SS" / "0" 等) → 分 */
function intervalToMin(v: string | null): number {
  if (!v) return 0;
  const m = /^(\d+):(\d{2})(?::(\d{2}))?/.exec(v.trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** work_date を含む週(日曜)開始日 yyyy-MM-dd。週起算は現行運用に合わせ日曜。 */
function weekStart(workDate: string): string {
  const d = new Date(`${workDate}T00:00:00Z`);
  const off = d.getUTCDay(); // 日曜(0)起算
  d.setUTCDate(d.getUTCDate() - off);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/**
 * 全ドライバーの確定勤務について改善基準告示の指標・違反を再計算する（仕様書 11.2 手順4）。
 * 移行で投入した shifts の clock_in/out から拘束/労働/深夜/休息を算出し、compliance_alerts を再構築。
 */
export async function recomputeAllMetrics(
  sb: SB,
): Promise<{ shifts: number; alerts: number }> {
  const config = await loadComplianceConfig(sb);
  const { data: drivers, error } = await sb.from("drivers").select("id");
  if (error) throw error;

  let shiftCount = 0;
  let alertCount = 0;

  for (const d of drivers ?? []) {
    const { data: shifts } = await sb
      .from("shifts")
      .select("*")
      .eq("driver_id", d.id)
      .not("clock_out_at", "is", null)
      .order("clock_in_at", { ascending: true });
    if (!shifts?.length) continue;

    let prevOut: string | null = null;
    const weekExt = new Map<string, number>();

    for (const s of shifts) {
      const metrics = calcShiftMetrics(
        {
          clockInAt: s.clock_in_at,
          clockOutAt: s.clock_out_at,
          restMin: intervalToMin(s.rest_time),
          prevClockOutAt: prevOut,
        },
        config,
      );
      const wk = weekStart(s.work_date);
      const ext = weekExt.get(wk) ?? 0;
      const judgement = judgeShift(metrics, config, { extendedCountThisWeek: ext });

      const warnR =
        judgement.items.find((i) => i.type === "restraint" && i.severity !== "info")?.message ?? null;
      const warnRest =
        judgement.items.find((i) => i.type === "rest_period" && i.severity !== "info")?.message ?? null;

      await sb
        .from("shifts")
        .update({
          restraint_min: metrics.restraintMin,
          labor_min: metrics.laborMin,
          night_min: metrics.nightMin,
          rest_period_min: metrics.restPeriodMin,
          warn_restraint: warnR,
          warn_rest: warnRest,
        })
        .eq("id", s.id);

      if (judgement.alertTypes.length > 0) {
        await sb.from("compliance_alerts").upsert(
          {
            shift_id: s.id,
            driver_id: s.driver_id,
            work_date: s.work_date,
            month_key: s.month_key,
            alert_types: judgement.alertTypes,
            restraint_min: metrics.restraintMin,
            labor_min: metrics.laborMin,
            rest_period_min: metrics.restPeriodMin,
            night_min: metrics.nightMin,
            detail: judgement.items as unknown as Json,
            status: "open",
          },
          { onConflict: "shift_id" },
        );
        alertCount += 1;
      } else {
        await sb.from("compliance_alerts").delete().eq("shift_id", s.id);
      }

      if (metrics.restraintMin != null && metrics.restraintMin > config.daily_restraint.extended_threshold_min) {
        weekExt.set(wk, ext + 1);
      }
      prevOut = s.clock_out_at;
      shiftCount += 1;
    }
  }
  return { shifts: shiftCount, alerts: alertCount };
}
