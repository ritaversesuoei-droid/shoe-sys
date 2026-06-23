import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { assembleDailyReport } from "@/lib/operations/daily-report";
import { renderDailyReportHtml } from "./daily-report-template";
import { htmlToPdf } from "./render";
import { storeReportPdf } from "./storage";
import { to_month_key } from "@/lib/datekey";

type SB = SupabaseClient<Database>;

/**
 * 日報PDFを生成して非公開バケットへ保存し、署名URLとパスを返す（F-17/18）。
 *   日報組立 → B5 HTML → Chrome(puppeteer-core)でPDF化 → Storage保存 → 署名URL。
 *   対象日の運行が無ければ null。API（オンデマンド）と日報確定（サーバー自動）の両方から使用。
 */
export async function generateDailyReportPdf(
  sb: SB,
  driverId: string,
  date: string,
): Promise<{ url: string; path: string } | null> {
  const report = await assembleDailyReport(sb, driverId, date);
  if (!report) return null;

  const { data: driver } = await sb.from("drivers").select("code, name").eq("id", driverId).maybeSingle();

  let restraintMin: number | null = null;
  if (report.shift_id) {
    const { data: shift } = await sb.from("shifts").select("restraint_min").eq("id", report.shift_id).maybeSingle();
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
  return { url, path };
}
