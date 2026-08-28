import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorFromSheets } from "@/lib/operations/mirror";
import { ok, handle } from "@/lib/api/response";

// 外部シート取得＋一括書込のため Node ＋ 長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/mirror
 *   並行運用ミラー（現行スプレッドシート → shoei-sys）を管理者が実行する。
 *   - 手動「現行から全同期」ボタン → body {force:true} で常に実行。
 *   - 盤面の5分自動起動(AutoMirror) → body 無し＝throttle（直近実行済みならスキップ）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const admin = createAdminClient();
    let force = false;
    try {
      const body = (await request.json()) as { force?: boolean } | null;
      force = body?.force === true;
    } catch {
      /* body 無し＝自動起動（throttle対象） */
    }
    const result = await mirrorFromSheets(admin, { force });
    return ok({ ...result });
  });
}
