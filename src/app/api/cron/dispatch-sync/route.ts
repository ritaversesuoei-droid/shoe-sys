import { createAdminClient } from "@/lib/supabase/admin";
import { syncDispatchFromSheet } from "@/lib/operations/dispatch-sync";
import { ok, fail, handle } from "@/lib/api/response";

// 外部シート取得＋一括書込のため Node ＋ 長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch-sync
 *   日次で「流れ表」スプレッドシート → dispatch_plans を自動同期する（Vercel Cron 用）。
 *   CRON_SECRET を環境変数に設定すると有効化（Vercel が Authorization: Bearer で呼ぶ）。
 *   未設定時は 503（無効）＝公開エンドポイントとして無防備に叩かれないようにする。
 */
export async function GET(request: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return fail("cron未設定です（CRON_SECRET を設定してください）", 503);
    if (request.headers.get("authorization") !== `Bearer ${secret}`) return fail("認証エラー", 401);

    const admin = createAdminClient();
    const result = await syncDispatchFromSheet(admin);
    return ok({ ...result });
  });
}
