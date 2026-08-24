import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorFromSheets } from "@/lib/operations/mirror";
import { ok, fail, handle } from "@/lib/api/response";
import { verifyBearer } from "@/lib/secure-compare";

// 外部シート取得＋一括書込のため Node ＋ 長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/mirror
 *   並行運用ミラー（現行スプレッドシート → shoei-sys）を1時間ごとに実行する（Vercel Cron 用）。
 *   CRON_SECRET を設定すると有効化（Vercel が Authorization: Bearer で呼ぶ）。未設定時は 503。
 *   取り込む対象・シートは MIRROR_* 環境変数で構成（未設定なら configured:false で何もしない）。
 */
export async function GET(request: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return fail("cron未設定です（CRON_SECRET を設定してください）", 503);
    if (!verifyBearer(request.headers.get("authorization"), secret)) return fail("認証エラー", 401);

    const admin = createAdminClient();
    const result = await mirrorFromSheets(admin);
    return ok({ ...result });
  });
}
