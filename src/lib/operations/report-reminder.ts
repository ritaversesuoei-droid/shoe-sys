import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { pushToDriver } from "@/lib/line/notify";

type SB = SupabaseClient<Database>;

/**
 * 日報未提出リマインド（ドライバー本人通知 / F-16 拡張）。
 *   指定日にクローズ済み勤務があるのに、その日の日報が確定(confirmed)されていない
 *   ドライバー本人へLINEで催促する。連携済みのドライバーのみ届く（未連携はスキップ）。
 */
export async function remindUnsubmittedReports(
  sb: SB,
  dateStr: string,
): Promise<{ worked: number; unsubmitted: number; reminded: number }> {
  // 当日クローズ済み勤務のドライバー
  const { data: shifts } = await sb
    .from("shifts")
    .select("driver_id")
    .eq("work_date", dateStr)
    .not("clock_out_at", "is", null);
  const workedIds = [...new Set((shifts ?? []).map((s) => s.driver_id).filter((v): v is string => !!v))];
  if (workedIds.length === 0) return { worked: 0, unsubmitted: 0, reminded: 0 };

  // その日に確定済みの日報
  const { data: reports } = await sb
    .from("daily_reports")
    .select("driver_id")
    .eq("report_date", dateStr)
    .eq("status", "confirmed");
  const done = new Set((reports ?? []).map((r) => r.driver_id));

  const targets = workedIds.filter((id) => !done.has(id));
  let reminded = 0;
  for (const id of targets) {
    const sent = await pushToDriver(
      id,
      [{ type: "text", text: `【日報リマインド】本日（${dateStr}）の日報が未提出です。運行終了後に日報の作成・確定をお願いします。` }],
      "日報リマインド",
    );
    if (sent) reminded += 1;
  }
  return { worked: workedIds.length, unsubmitted: targets.length, reminded };
}
