import { createClient } from "@/lib/supabase/server";
import { getSessionContext, AuthError } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { assembleDailyReport } from "@/lib/operations/daily-report";
import { renderDailyReportHtml } from "@/lib/pdf/daily-report-template";
import { htmlToPdf } from "@/lib/pdf/render";
import { storeReportPdf } from "@/lib/pdf/storage";
import { to_month_key } from "@/lib/datekey";

/**
 * POST /api/reports/:date/:driverId/pdf  日報PDF生成（仕様書 F-17, 8.1）
 *   日報を組立 → B5 HTMLテンプレート → Chrome(puppeteer-core)でPDF化 →
 *   非公開バケットへ保存 → 署名付きURLを返す。ドライバー本人 or 管理者のみ。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ date: string; driverId: string }> },
) {
  return handle(async () => {
    const ctx = await getSessionContext();
    if (!ctx) throw new AuthError("未認証です", 401);
    const { date, driverId } = await params;
    if (ctx.role !== "admin" && ctx.driverId !== driverId) {
      throw new AuthError("権限がありません", 403);
    }

    const supabase = await createClient();
    const report = await assembleDailyReport(supabase, driverId, date);
    if (!report) return fail("対象日の運行データがありません", 404);

    // ドライバー情報・拘束時間を補完
    const { data: driver } = await supabase
      .from("drivers")
      .select("code, name")
      .eq("id", driverId)
      .maybeSingle();
    let restraintMin: number | null = null;
    if (report.shift_id) {
      const { data: shift } = await supabase
        .from("shifts")
        .select("restraint_min")
        .eq("id", report.shift_id)
        .maybeSingle();
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

    const pdf = await htmlToPdf(html);
    const path = `${to_month_key(`${date}T00:00:00+09:00`)}/${driverId}/${date}.pdf`;
    const url = await storeReportPdf(path, pdf);

    return ok({ url, path });
  });
}
