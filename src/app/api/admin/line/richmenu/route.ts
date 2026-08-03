import { requireAdmin } from "@/lib/auth";
import { setupDriverRichMenu } from "@/lib/line/richmenu";
import { isReplyConfigured } from "@/lib/line/notify";
import { ok, fail, handle } from "@/lib/api/response";

// 画像生成(puppeteer)＋LINE API のため Node ＋長め
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/line/richmenu  ドライバー向けリッチメニューを作成し既定に設定する（管理者のみ）。
 *   本番（トークン設定済み）で実行する。LIFF未設定でも公開URL(/driver)で登録は可能。
 */
export async function POST() {
  return handle(async () => {
    await requireAdmin();
    if (!isReplyConfigured()) return fail("LINEトークンが未設定です", 503);
    const r = await setupDriverRichMenu();
    return ok(r);
  });
}
