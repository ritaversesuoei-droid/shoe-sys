import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorFromSheets } from "@/lib/operations/mirror";
import { ok, handle } from "@/lib/api/response";

// 外部シート取得＋一括書込のため Node ＋ 長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/mirror
 *   並行運用ミラー（現行スプレッドシート → shoei-sys）を管理者が手動実行する。
 *   自動（5分ごとの cron）と同じ処理を、今すぐ動かすためのボタン用。
 */
export async function POST() {
  return handle(async () => {
    await requireAdmin();
    const admin = createAdminClient();
    const result = await mirrorFromSheets(admin);
    return ok({ ...result });
  });
}
