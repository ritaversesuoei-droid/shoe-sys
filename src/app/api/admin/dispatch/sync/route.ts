import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, handle } from "@/lib/api/response";
import { syncDispatchFromSheet } from "@/lib/operations/dispatch-sync";

// 外部シート取得＋一括書込のため Node ＋ 長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/dispatch/sync
 *   TROUD由来の「流れ表」Googleスプレッドシート → dispatch_plans を最新化（管理者のみ）。
 */
export async function POST() {
  return handle(async () => {
    await requireAdmin();
    const admin = createAdminClient();
    const result = await syncDispatchFromSheet(admin);
    return ok({ ...result });
  });
}
