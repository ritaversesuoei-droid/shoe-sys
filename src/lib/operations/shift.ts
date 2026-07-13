import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { AppError } from "@/lib/errors";
import { to_month_key, toWorkDate } from "@/lib/datekey";
import {
  loadComplianceConfig,
  calcShiftMetrics,
  judgeShift,
  type ShiftMetrics,
  type ShiftJudgement,
  type ShiftWorkMode,
} from "@/lib/compliance";

type SB = SupabaseClient<Database>;
type ShiftRow = Database["public"]["Tables"]["shifts"]["Row"];

/** interval文字列("HH:MM:SS" / "0" / "90 minutes"等) → 分 */
function intervalToMin(v: string | null): number {
  if (!v) return 0;
  const m = /^(\d+):(\d{2})(?::(\d{2}))?/.exec(v.trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const min = /^(\d+)\s*min/i.exec(v.trim());
  if (min) return Number(min[1]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 分 → interval文字列 "H:MM:00"（shifts.rest_time 用） */
export function minToInterval(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}:00`;
}

/** work_date(yyyy-MM-dd) を含む週(日曜〜土曜)の範囲を返す。週起算は現行運用に合わせ日曜。 */
function weekRange(workDate: string): { start: string; end: string } {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const d = new Date(`${workDate}T00:00:00Z`);
  const sundayOffset = d.getUTCDay(); // 日曜(0)からの経過日数
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - sundayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: fmt(start), end: fmt(end) };
}

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
 * 勤務の指標算出 → shift 更新 → 違反台帳 upsert/解消 を行う共通処理。
 *   closeShift（退勤時）と recomputeShift（日報確定で休憩反映時）の両方から使用。
 */
async function persistShiftMetrics(
  sb: SB,
  shift: ShiftRow,
  clockOutAt: string,
  restMin: number,
): Promise<CloseResult> {
  const config = await loadComplianceConfig(sb);
  const prev = shift.clock_in_at
    ? await findPreviousClosedShift(sb, shift.driver_id, shift.clock_in_at)
    : null;

  const metrics = calcShiftMetrics(
    { clockInAt: shift.clock_in_at, clockOutAt, restMin, prevClockOutAt: prev?.clock_out_at ?? null },
    config,
  );

  // 拘束14h超の「週2回まで」判定（仕様書6.3）。同一週(Mon-Sun)の自分以外の超過回数。
  const week = weekRange(shift.work_date);
  const { count } = await sb
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", shift.driver_id)
    .gte("work_date", week.start)
    .lte("work_date", week.end)
    .neq("id", shift.id)
    .not("clock_out_at", "is", null)
    .gt("restraint_min", config.daily_restraint.extended_threshold_min);

  // 改善基準告示の特例（該当勤務のみ・要社労士確認）を作業区分から適用
  const workMode: ShiftWorkMode = {
    crewType: shift.crew_type === "double" ? "double" : "single",
    ferryMin: shift.ferry_min ?? 0,
    splitRest: shift.split_rest === true,
  };
  const judgement = judgeShift(metrics, config, { extendedCountThisWeek: count ?? 0 }, workMode);

  const warnRestraint =
    judgement.items.find((i) => i.type === "restraint" && i.severity !== "info")?.message ?? null;
  const warnRest =
    judgement.items.find((i) => i.type === "rest_period" && i.severity !== "info")?.message ?? null;

  const { error: updErr } = await sb
    .from("shifts")
    .update({
      clock_out_at: clockOutAt,
      restraint_min: metrics.restraintMin,
      labor_min: metrics.laborMin,
      night_min: metrics.nightMin,
      rest_period_min: metrics.restPeriodMin,
      warn_restraint: warnRestraint,
      warn_rest: warnRest,
    })
    .eq("id", shift.id);
  if (updErr) throw updErr;

  // 違反/警告があれば台帳へ（shift と 1:1）。無ければ既存 open を削除（再計算で解消）。
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

/**
 * 勤務をクローズ（退勤 / 長距離休憩）。確定退勤を記録 → 拘束/労働/深夜/休息を算出（6.1）
 *   → 改善基準告示判定（6.2）→ shift 更新 → compliance_alerts を 1:1 upsert。
 *   休憩は shift.rest_time（日報未確定時は既定0）を採用。確定時は recomputeShift で再反映。
 */
export async function closeShift(
  sb: SB,
  shift: ShiftRow,
  occurredAt: string,
): Promise<CloseResult> {
  return persistShiftMetrics(sb, shift, occurredAt, intervalToMin(shift.rest_time));
}

/**
 * 既存の確定勤務を再計算（日報確定で休憩 rest_time を反映した後などに呼ぶ）。
 *   shift.rest_time を休憩として拘束/労働/深夜/休息を再算出し、違反台帳も更新。
 */
export async function recomputeShift(sb: SB, shiftId: string): Promise<CloseResult | null> {
  const { data: shift, error } = await sb.from("shifts").select("*").eq("id", shiftId).maybeSingle();
  if (error) throw error;
  if (!shift || !shift.clock_out_at) return null;
  return persistShiftMetrics(sb, shift, shift.clock_out_at, intervalToMin(shift.rest_time));
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function hhmmOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]!}`;
}

export interface ShiftEditInput {
  editedIn?: string | null;
  editedOut?: string | null;
  inAdjDays?: number;
  outAdjDays?: number;
  restMin?: number;
  reason?: string | null;
  // 改善基準告示の特例（該当勤務のみ・要社労士確認）
  crewType?: "single" | "double";
  ferryMin?: number;
  splitRest?: boolean;
}

/**
 * 勤怠修正（修正入力 / F-19）。修正出退勤(HH:MM)＋補正(日数)＋休憩(分)＋理由を反映し、
 * 確定出退勤(clock_in/out)を再構成 → 拘束/労働/深夜/休息を再計算 → 違反再判定。
 * 無指定の項目は既存値→実績で補完。出勤時刻が無い場合は AppError(422)。
 */
export async function applyShiftEdit(
  sb: SB,
  shiftId: string,
  edit: ShiftEditInput,
): Promise<CloseResult | null> {
  const { data: shift, error } = await sb.from("shifts").select("*").eq("id", shiftId).maybeSingle();
  if (error) throw error;
  if (!shift) throw new AppError("勤務が見つかりません", 404);

  const inTime = hhmmOf(edit.editedIn ?? shift.edited_in ?? shift.actual_in);
  const outTime = hhmmOf(edit.editedOut ?? shift.edited_out ?? shift.actual_out);
  const inAdj = edit.inAdjDays ?? shift.edited_in_adj_days;
  const outAdj = edit.outAdjDays ?? shift.edited_out_adj_days;
  if (!inTime) throw new AppError("出勤時刻が必要です", 422);

  const clockIn = `${addDaysStr(shift.work_date, inAdj)}T${inTime}:00+09:00`;
  const clockOut = outTime ? `${addDaysStr(shift.work_date, outAdj)}T${outTime}:00+09:00` : null;

  const { error: e1 } = await sb
    .from("shifts")
    .update({
      clock_in_at: clockIn,
      clock_out_at: clockOut,
      edited_in: `${inTime}:00`,
      edited_out: outTime ? `${outTime}:00` : null,
      edited_in_adj_days: inAdj,
      edited_out_adj_days: outAdj,
      rest_time: edit.restMin != null ? minToInterval(edit.restMin) : shift.rest_time,
      revision_status: "edited",
      revision_reason: edit.reason ?? shift.revision_reason,
      crew_type: edit.crewType ?? shift.crew_type,
      ferry_min: edit.ferryMin ?? shift.ferry_min,
      split_rest: edit.splitRest ?? shift.split_rest,
    })
    .eq("id", shiftId);
  if (e1) throw e1;

  return recomputeShift(sb, shiftId);
}
