import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { saveDailyReportSchema } from "@/lib/validation";
import { assembleDailyReport, saveDailyReport } from "@/lib/operations/daily-report";

// 確定(POST)時にサーバーでPDFを生成（Chrome起動）するためNode＋長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/daily-reports?date=yyyy-MM-dd  日報読込（仕様書 F-10 / 4.6）
 *   既存日報があれば復元、無ければ event の積込・荷卸から明細を自動生成し、
 *   運行連結(長距離休憩跨ぎ)・メーター補完を行ったドラフトを返す。
 */
export async function GET(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (!date) return fail("date クエリが必要です", 400);

    const supabase = await createClient();
    const report = await assembleDailyReport(supabase, ctx.driverId, date);
    return ok({ report, generated: report?.generated ?? false, driverId: ctx.driverId });
  });
}

/**
 * POST /api/daily-reports  日報保存（仕様書 4.6, 8.1）
 *   status=draft は一時書き、status=confirmed は確定（バリデーション必須）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = saveDailyReportSchema.parse(await request.json());
    const supabase = await createClient();
    const report = await saveDailyReport(supabase, ctx.driverId, body);
    return ok({ report }, body.id ? 200 : 201);
  });
}
