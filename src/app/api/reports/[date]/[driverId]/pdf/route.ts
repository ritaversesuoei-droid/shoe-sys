import { createClient } from "@/lib/supabase/server";
import { getSessionContext, AuthError } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { generateDailyReportPdf } from "@/lib/pdf/generate";

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
    const result = await generateDailyReportPdf(supabase, driverId, date);
    if (!result) return fail("対象日の運行データがありません", 404);
    return ok(result);
  });
}
