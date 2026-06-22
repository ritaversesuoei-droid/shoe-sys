import { getSessionContext, AuthError } from "@/lib/auth";
import { handle, notImplemented } from "@/lib/api/response";

/**
 * POST /api/reports/:date/:driverId/pdf  日報PDF生成（仕様書 F-17, 8.1）
 *   サーバーサイドで HTML テンプレートをレンダリング（Puppeteer 既定 / 13章G）、
 *   B5・1運行1枚、退勤打刻時に自動生成し Storage 保存。
 *   ※ Puppeteer は重量級依存のため、本フェーズでは未導入。次フェーズで生成器を実装。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ date: string; driverId: string }> },
) {
  return handle(async () => {
    const ctx = await getSessionContext();
    if (!ctx) throw new AuthError("未認証です", 401);
    // ドライバー本人 or 管理者のみ
    const { date, driverId } = await params;
    if (ctx.role !== "admin" && ctx.driverId !== driverId) {
      throw new AuthError("権限がありません", 403);
    }
    return notImplemented(`日報PDF生成（F-17, ${date}/${driverId}）は次フェーズで実装`);
  });
}
