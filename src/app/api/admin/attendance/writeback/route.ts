import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAttendanceWriteback } from "@/lib/operations/attendance-writeback";
import { pushToSheet } from "@/lib/sheets/writeback";
import { ok, fail, handle } from "@/lib/api/response";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ month: z.string().regex(/^\d{6}$/) });

/**
 * POST /api/admin/attendance/writeback  指定月の勤怠修正をスプレッドシート（shift_log）へ書き戻す。管理者のみ。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const { month } = schema.parse(await request.json());
    const admin = createAdminClient();
    const payload = await buildAttendanceWriteback(admin, month);
    const r = await pushToSheet(payload);
    if (r.configured === false) return fail(r.note ?? "書き戻し先が未設定です", 503);
    if (r.ok === false) return fail(r.error ?? "書き戻しに失敗しました", 502);
    return ok({ month, updates: payload.updates.length, applied: r.applied, note: r.note });
  });
}
