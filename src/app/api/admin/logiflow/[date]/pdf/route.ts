import { requireAdmin, AuthError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLogiFlowBoard } from "@/lib/operations/logiflow";
import { renderLogiFlowHtml } from "@/lib/pdf/logiflow-template";
import { htmlToPdf } from "@/lib/pdf/render";

// PDF は Chrome 起動を伴うため Node ランタイム＋長めのタイムアウト（サーバーレス対応）。
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/admin/logiflow/:date/pdf  流れ表のPDF出力（A4縦・1ドライバー1行・案件横並び）。
 *   新規タブで開き、そのまま印刷できる（ブラウザ印刷のはみ出し/分断を回避）。管理者のみ。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 403;
    return new Response("権限がありません", { status });
  }
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("date は yyyy-MM-dd 形式", { status: 400 });

  const sb = await createClient();
  const board = await getLogiFlowBoard(sb, date);
  const html = renderLogiFlowHtml(board);
  const pdf = await htmlToPdf(html, { format: "A4", landscape: false });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="logiflow_${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
