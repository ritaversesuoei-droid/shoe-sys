import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import {
  getInstructionsForDate,
  setInstructionTime,
  setInstructionTimesBulk,
  normalizeHhmm,
} from "@/lib/operations/attendance-instruction";

/**
 * GET /api/admin/attendance-instructions?date=yyyy-MM-dd
 *   当日の出勤指示時間一覧（driverId → HH:MM）。
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date は yyyy-MM-dd 形式", 400);
    const supabase = await createClient();
    const instructions = await getInstructionsForDate(supabase, date);
    return ok({ date, instructions });
  });
}

/**
 * PATCH /api/admin/attendance-instructions  出勤指示時間の設定（日別×ドライバー別）
 *   body: { driver_id: uuid, date: 'yyyy-MM-dd', time: 'HH:MM' | '' | null }
 *   time が空/null なら解除。
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = (await request.json()) as { driver_id?: string; date?: string; time?: string | null };
    const driverId = body.driver_id ?? "";
    const date = body.date ?? "";
    if (!driverId) return fail("driver_id は必須", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date は yyyy-MM-dd 形式", 400);

    const raw = body.time ?? null;
    // 空文字は解除。値ありは HH:MM 妥当性チェック。
    const time = raw && raw.trim() !== "" ? normalizeHhmm(raw) : null;
    if (raw && raw.trim() !== "" && time === null) return fail("time は HH:MM 形式（00:00〜23:59）", 400);

    const supabase = await createClient();
    await setInstructionTime(supabase, driverId, date, time);
    return ok({ driver_id: driverId, date, time });
  });
}

/**
 * PUT /api/admin/attendance-instructions  出勤指示時間の一括設定（複数ドライバーへ同一時刻）
 *   body: { date: 'yyyy-MM-dd', driver_ids: uuid[], time: 'HH:MM' | '' | null }
 *   time が空/null なら一括解除。
 */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = (await request.json()) as { date?: string; driver_ids?: string[]; time?: string | null };
    const date = body.date ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date は yyyy-MM-dd 形式", 400);
    const ids = Array.isArray(body.driver_ids)
      ? body.driver_ids.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    if (ids.length === 0) return fail("driver_ids は必須（1件以上）", 400);

    const raw = body.time ?? null;
    const time = raw && raw.trim() !== "" ? normalizeHhmm(raw) : null;
    if (raw && raw.trim() !== "" && time === null) return fail("time は HH:MM 形式（00:00〜23:59）", 400);

    const supabase = await createClient();
    const res = await setInstructionTimesBulk(supabase, date, ids, time);
    return ok({ date, ...res });
  });
}
