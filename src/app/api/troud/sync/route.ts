import { createAdminClient } from "@/lib/supabase/admin";
import { applyDispatchRows } from "@/lib/operations/dispatch-sync";
import { ok, fail, handle } from "@/lib/api/response";

// 外部連携＋一括書込のため Node ＋ 長めのタイムアウト
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/troud/sync  TROUD 直連携の取込口（Googleシートを介さず直接受ける）。
 *   認証: TROUD_SYNC_SECRET を Authorization: Bearer か x-troud-secret ヘッダで。
 *   本文: 行データ（列順 [所属, ドライバー名, 携帯, 車両NO, 積込日, 荷主, 積地, 着荷日, 着荷地, 注意, 高速, 表示順]）。
 *     受理形式: [[...],[...]] / {rows:[[...]]} / {values:[[...]]} / {data:[[...]]}（Sheets API等の形も可）。
 *   TROUD側で修正のたびに本エンドポイントへ送れば dispatch_plans に即時反映される。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const secret = process.env.TROUD_SYNC_SECRET;
    if (!secret) return fail("TROUD連携が未設定です（TROUD_SYNC_SECRET を設定してください）", 503);
    const auth = request.headers.get("authorization");
    const hdr = request.headers.get("x-troud-secret");
    if (auth !== `Bearer ${secret}` && hdr !== secret) return fail("認証エラー", 401);

    const body = (await request.json()) as unknown;
    const raw = Array.isArray(body)
      ? body
      : ((body as Record<string, unknown>)?.rows ??
        (body as Record<string, unknown>)?.values ??
        (body as Record<string, unknown>)?.data);
    if (!Array.isArray(raw)) return fail("行データ（配列の配列）が必要です", 400);

    let dataRows: string[][] = raw
      .filter((r): r is unknown[] => Array.isArray(r))
      .map((r) => r.map((c) => (c == null ? "" : String(c))));
    // ヘッダ行が含まれていれば除去
    if (dataRows[0] && /所属|ドライバー/.test(dataRows[0].join(","))) dataRows = dataRows.slice(1);
    // 空行除去
    dataRows = dataRows.filter((r) => r.some((c) => c && c.trim()));

    const admin = createAdminClient();
    const result = await applyDispatchRows(admin, dataRows);
    return ok({ ...result });
  });
}
