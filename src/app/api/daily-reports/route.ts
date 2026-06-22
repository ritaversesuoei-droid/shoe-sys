import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, fail, handle, notImplemented } from "@/lib/api/response";
import { saveDailyReportSchema } from "@/lib/validation";

/**
 * GET /api/daily-reports?date=yyyy-MM-dd  日報読込（仕様書 F-10, 8.1）
 *   自動補完ロジック（読込時, 4.6）:
 *     - shift_log を遡り長距離休憩を跨ぐ複数日を1運行として連結
 *     - 既存の日報下書きがあれば復元
 *     - 無ければ event_log の積込・荷卸を時系列マッピングして明細を自動生成   … TODO
 */
export async function GET(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (!date) return fail("date クエリが必要です", 400);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_reports")
      .select("*, daily_report_legs(*), daily_report_rests(*)")
      .eq("driver_id", ctx.driverId)
      .eq("report_date", date)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (error) throw error;

    // 既存日報があれば返す。無ければ event からの自動生成（TODO）。
    if (data) return ok({ report: data, generated: false });
    return ok({ report: null, generated: false, note: "自動生成は未実装（4.6）" });
  });
}

/**
 * POST /api/daily-reports  日報保存（仕様書 4.6, 8.1）
 *   業務ルール: 「保存」=draft、「確定」=通常退勤打刻時のみ。長距離休憩では確定しない。
 *   保存時バリデーション(4.6): 運行ルート確認 / 終了<開始エラー / 休憩合計90分以上 /
 *     休憩場所必須 / 車番必須 … 一部 Zod、残りは下記で実装  … TODO
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireDriver();
    const body = saveDailyReportSchema.parse(await request.json());

    // TODO: ヘッダ upsert → legs/rests 差し替え（トランザクション的に） → 確定時は confirmed_at 記録
    //       + 退勤打刻との整合（shift.clock_out_at）と PDF 生成トリガー（F-17）。
    void body;
    return notImplemented("日報保存パイプライン（4.6）は次フェーズで実装");
  });
}
