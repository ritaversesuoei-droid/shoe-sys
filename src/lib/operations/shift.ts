import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { to_month_key, toWorkDate } from "@/lib/datekey";
import {
  loadComplianceConfig,
  calcShiftMetrics,
  judgeShift,
  type ShiftMetrics,
  type ShiftJudgement,
} from "@/lib/compliance";

type SB = SupabaseClient<Database>;
type ShiftRow = Database["public"]["Tables"]["shifts"]["Row"];

/** ドライバーの「開いている勤務」（退勤未記入）を1件返す。仕様書 4.3.2 / 4.3.3。 */
export async function findOpenShift(
  sb: SB,
  driverId: string,
): Promise<ShiftRow | null> {
  const { data, error } = await sb
    .from("shifts")
    .select("*")
    .eq("driver_id", driverId)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 当該勤務出勤の直前に退勤済みの勤務（休息期間算定用）。 */
async function findPreviousClosedShift(
  sb: SB,
  driverId: string,
  beforeIso: string,
): Promise<{ clock_out_at: string | null } | null> {
  const { data, error } = await sb
    .from("shifts")
    .select("clock_out_at")
    .eq("driver_id", driverId)
    .not("clock_out_at", "is", null)
    .lt("clock_out_at", beforeIso)
    .order("clock_out_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 新規勤務を作成（出発 / 各駅出発）。clock_in_at を確定出勤として記録。 */
export async function openShift(
  sb: SB,
  driverId: string,
  occurredAt: string,
): Promise<ShiftRow> {
  const { data, error } = await sb
    .from("shifts")
    .insert({
      driver_id: driverId,
      work_date: toWorkDate(occurredAt),
      month_key: to_month_key(occurredAt),
      clock_in_at: occurredAt,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("勤務の作成に失敗しました");
  return data;
}

export interface CloseResult {
  metrics: ShiftMetrics;
  judgement: ShiftJudgement;
}

/**
 * 勤務をクローズ（退勤 / 長距離休憩）。
 *   確定退勤を記録 → 拘束/労働/深夜/休息を算出（仕様書6.1）→ 改善基準告示判定（6.2）
 *   → shift 更新 → compliance_alerts を 1:1 upsert。
 */
export async function closeShift(
  sb: SB,
  shift: ShiftRow,
  occurredAt: string,
): Promise<CloseResult> {
  const config = await loadComplianceConfig(sb);

  // 休憩は日報入力で確定するため、本パイプライン時点では shift.rest_time(既定0) を採用。
  // TODO: 紐付く daily_report_rests があれば合算して再計算（日報フェーズ）。
  const restMin = 0;

  const prev = shift.clock_in_at
    ? await findPreviousClosedShift(sb, shift.driver_id, shift.clock_in_at)
    : null;

  const metrics = calcShiftMetrics(
    {
      clockInAt: shift.clock_in_at,
      clockOutAt: occurredAt,
      restMin,
      prevClockOutAt: prev?.clock_out_at ?? null,
    },
    config,
  );

  // TODO: 拘束14h超の「週2回まで」判定は週次集計(F-14)で精緻化。ここでは単発判定。
  const judgement = judgeShift(metrics, config);

  const warnRestraint =
    judgement.items.find((i) => i.type === "restraint" && i.severity !== "info")
      ?.message ?? null;
  const warnRest =
    judgement.items.find((i) => i.type === "rest_period" && i.severity !== "info")
      ?.message ?? null;

  const { error: updErr } = await sb
    .from("shifts")
    .update({
      clock_out_at: occurredAt,
      restraint_min: metrics.restraintMin,
      labor_min: metrics.laborMin,
      night_min: metrics.nightMin,
      rest_period_min: metrics.restPeriodMin,
      warn_restraint: warnRestraint,
      warn_rest: warnRest,
    })
    .eq("id", shift.id);
  if (updErr) throw updErr;

  // 違反/警告があれば台帳へ（shift と 1:1）。無ければ既存 open を解消なしで残す方針（監査）。
  if (judgement.alertTypes.length > 0) {
    const { error: alertErr } = await sb.from("compliance_alerts").upsert(
      {
        shift_id: shift.id,
        driver_id: shift.driver_id,
        work_date: shift.work_date,
        month_key: shift.month_key,
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
    if (alertErr) throw alertErr;
  }

  return { metrics, judgement };
}
