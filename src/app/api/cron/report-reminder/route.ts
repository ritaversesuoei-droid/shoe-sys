import { createAdminClient } from "@/lib/supabase/admin";
import { remindUnsubmittedReports } from "@/lib/operations/report-reminder";
import { toWorkDate } from "@/lib/datekey";
import { ok, fail, handle } from "@/lib/api/response";
import { verifyBearer } from "@/lib/secure-compare";

// 外部API（LINE push）呼び出しのため Node
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/report-reminder
 *   その日の日報が未提出のドライバー本人へリマインドを送る（夜間に実行想定）。
 *   CRON_SECRET を設定すると有効化。GitHub Actions 等から Bearer で起動する。
 *   ?date=YYYY-MM-DD で対象日を指定可（既定は当日JST）。
 */
export async function GET(request: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return fail("cron未設定です（CRON_SECRET を設定してください）", 503);
    if (!verifyBearer(request.headers.get("authorization"), secret)) return fail("認証エラー", 401);

    const url = new URL(request.url);
    const q = url.searchParams.get("date");
    const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : toWorkDate(new Date());

    const admin = createAdminClient();
    const result = await remindUnsubmittedReports(admin, date);
    return ok({ date, ...result });
  });
}
