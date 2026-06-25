import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { assembleDailyReport } from "@/lib/operations/daily-report";
import { renderDailyReportHtml } from "@/lib/pdf/daily-report-template";

// サーバーレスでも確実に動く印刷ビュー（headless Chrome 不要。ブラウザ印刷でPDF化）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/:date/:driverId/print  印刷用日報（HTML）/ F-17/18
 *   当日運行データから日報を組立て B5 印刷レイアウトのHTMLを返す。管理者・本人のみ。
 *   ブラウザの印刷（Ctrl+P / PDF保存）で出力する想定。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string; driverId: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return new Response("ログインが必要です", { status: 401 });
  const { date, driverId } = await params;
  if (ctx.role !== "admin" && ctx.driverId !== driverId) {
    return new Response("権限がありません", { status: 403 });
  }

  const supabase = await createClient();
  const report = await assembleDailyReport(supabase, driverId, date);
  if (!report) return new Response("対象日の運行データがありません", { status: 404 });

  const { data: driver } = await supabase.from("drivers").select("code, name").eq("id", driverId).maybeSingle();
  let restraintMin: number | null = null;
  if (report.shift_id) {
    const { data: shift } = await supabase.from("shifts").select("restraint_min").eq("id", report.shift_id).maybeSingle();
    restraintMin = shift?.restraint_min ?? null;
  }

  const html = renderDailyReportHtml({
    reportDate: report.report_date,
    driverName: driver?.name ?? "",
    driverCode: driver?.code ?? null,
    vehicleNo: report.vehicle_no,
    crew: report.crew,
    departureAt: report.departure_at,
    returnAt: report.return_at,
    meterStart: report.meter_start,
    meterEnd: report.meter_end,
    restraintMin,
    legs: report.legs,
    rests: report.rests,
    notes: report.notes,
  });

  // 開いたら印刷ダイアログを促す（任意でキャンセル可）
  const withPrint = html.replace(
    "</body>",
    "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script></body>",
  );
  return new Response(withPrint, { headers: { "content-type": "text/html; charset=utf-8" } });
}
