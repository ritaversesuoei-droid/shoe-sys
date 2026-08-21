import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDispatchWriteback } from "@/lib/operations/dispatch-writeback";
import { pushToSheet } from "@/lib/sheets/writeback";
import { ok, fail, handle } from "@/lib/api/response";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/**
 * POST /api/admin/dispatch/writeback  指定日の配車をスプレッドシート（流れ表）へ書き戻す。管理者のみ。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const { date } = schema.parse(await request.json());
    const admin = createAdminClient();
    const payload = await buildDispatchWriteback(admin, date);
    const r = await pushToSheet(payload);
    if (r.configured === false) return fail(r.note ?? "書き戻し先が未設定です", 503);
    if (r.ok === false) return fail(r.error ?? "書き戻しに失敗しました", 502);
    return ok({ date, rows: payload.rows.length, applied: r.applied, note: r.note });
  });
}
