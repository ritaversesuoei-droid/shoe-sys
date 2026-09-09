import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { loadComplianceConfig, calcShiftMetrics, judgeShift, maxContinuousDriveMin, evaluateSplitRestTotal } from "@/lib/compliance";
import type { ShiftMetrics, ShiftJudgement } from "@/lib/compliance";
import { pairBreakEvents } from "@/lib/operations/shift";

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
  opts: { driverIds?: string[]; sinceWorkDate?: string } = {},
): Promise<{ shifts: number; alerts: number }> {
  const config = await loadComplianceConfig(sb);
  // 430(連続運転)判定は休憩ボタン運用時のみ（手入力=打刻なしでの誤警告を避ける）。設定を一度だけ読む。
  const { data: featRow } = await sb.from("app_settings").select("value").eq("key", "features").maybeSingle();
  const restButtonOn = (featRow?.value as { rest_button?: boolean } | null)?.rest_button === true;
  // driverIds 指定時はそのドライバーのみ再計算（差分ミラーの高速化用。
  //   週次・前勤務休息の文脈は各ドライバーの全勤務を辿るため精度は保たれる）。
  let dq = sb.from("drivers").select("id");
  if (opts.driverIds?.length) dq = dq.in("id", opts.driverIds);
  const { data: drivers, error } = await dq;
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

    // ② 深夜休憩控除用: このドライバーの休憩打刻を一括取得し shift_id ごとに区間化（打刻なしなら空）。
    const { data: restEvs } = await sb
      .from("events")
      .select("shift_id, event_type, occurred_at")
      .eq("driver_id", d.id)
      .in("event_type", ["rest_start", "rest_end"])
      .order("occurred_at", { ascending: true });
    const evsByShift = new Map<string, { event_type: string; occurred_at: string }[]>();
    for (const e of restEvs ?? []) {
      if (!e.shift_id) continue;
      const arr = evsByShift.get(e.shift_id) ?? [];
      arr.push({ event_type: e.event_type, occurred_at: e.occurred_at });
      evsByShift.set(e.shift_id, arr);
    }

    // pass1: 全勤務の指標・判定を計算（前勤務退勤・週次拡張回数の文脈をスレッド）。書き込みは後段。
    type Computed = { s: (typeof shifts)[number]; metrics: ShiftMetrics; judgement: ShiftJudgement; write: boolean };
    const computed: Computed[] = [];
    let prevOut: string | null = null;
    const weekExt = new Map<string, number>();
    for (const s of shifts) {
      const breaks = pairBreakEvents(evsByShift.get(s.id) ?? []);
      const metrics = calcShiftMetrics(
        { clockInAt: s.clock_in_at, clockOutAt: s.clock_out_at, restMin: intervalToMin(s.rest_time), prevClockOutAt: prevOut, breaks },
        config,
      );
      const wk = weekStart(s.work_date);
      const ext = weekExt.get(wk) ?? 0;
      const continuousDriveMin = restButtonOn
        ? maxContinuousDriveMin(s.clock_in_at, s.clock_out_at, breaks, config) ?? undefined
        : undefined;
      const judgement = judgeShift(metrics, config, { extendedCountThisWeek: ext, continuousDriveMin });
      // 書き込みは対象期間の勤務だけに絞る（差分ミラーの高速化。文脈は全勤務を辿って正しく積む）。
      computed.push({ s, metrics, judgement, write: !opts.sinceWorkDate || s.work_date >= opts.sinceWorkDate });
      if (metrics.restraintMin != null && metrics.restraintMin > config.daily_restraint.extended_threshold_min) {
        weekExt.set(wk, ext + 1);
      }
      prevOut = s.clock_out_at;
    }

    // ③ 分割休息の合計判定: 連続する split_rest 勤務を1グループにまとめ、合計10/12h未満・分割数超過を
    //    グループ末尾の勤務へ違反として付与（各セグメントの3h下限は per-shift の rest_period で別途）。
    //    ※グループの括り方は運用解釈のため要社労士確認。split_rest が無い通常運用では発火しない。
    {
      let group: Computed[] = [];
      const flush = () => {
        if (group.length >= 2) {
          const r = evaluateSplitRestTotal(group.map((c) => c.metrics.restPeriodMin ?? 0), config);
          if (!r.ok) {
            const last = group[group.length - 1]!;
            last.judgement.items.push({
              type: "split_rest",
              severity: "violation",
              message: r.exceedsSplits
                ? `分割休息の分割回数が上限(${config.special_cases.split_rest.max_splits}回)を超過（${r.segments}分割）`
                : `分割休息の合計が下限(${Math.round(r.requiredMin / 60)}h)未満（${r.segments}分割・実${Math.round((r.totalMin / 60) * 10) / 10}h）`,
              actualMin: r.totalMin,
              thresholdMin: r.requiredMin,
            });
            if (!last.judgement.alertTypes.includes("split_rest")) last.judgement.alertTypes.push("split_rest");
          }
        }
        group = [];
      };
      for (const c of computed) {
        if (c.s.split_rest === true) group.push(c);
        else flush();
      }
      flush();
    }

    // pass2: 書き込み（対象期間の勤務のみ）。
    for (const { s, metrics, judgement, write } of computed) {
      if (!write) continue;
      const warnR = judgement.items.find((i) => i.type === "restraint" && i.severity !== "info")?.message ?? null;
      const warnRest = judgement.items.find((i) => i.type === "rest_period" && i.severity !== "info")?.message ?? null;
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
      shiftCount += 1;
    }
  }
  return { shifts: shiftCount, alerts: alertCount };
}
