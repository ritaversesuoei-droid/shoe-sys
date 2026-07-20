import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, handle } from "@/lib/api/response";
import { z } from "zod";
import { applyShiftEdit } from "@/lib/operations/shift";

/**
 * GET /api/admin/shifts/:id  1勤務の打刻履歴＋前後時刻（③(4)(5)）
 *   その日の動き（TIM盤面相当の打刻列）と、前日退勤/当日出勤/当日退勤の時刻を返す。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const supabase = await createClient();

    const { data: shift } = await supabase
      .from("shifts")
      .select("id, driver_id, clock_in_at, clock_out_at, work_date, drivers(code, name)")
      .eq("id", id)
      .maybeSingle();
    if (!shift) return fail("勤務が見つかりません", 404);

    const { data: events } = await supabase
      .from("events")
      .select("id, event_type, occurred_at, vehicle_no, address, note, event_items(shipper, delivery_spot, quantity, weight, cargo_type, receipts)")
      .eq("shift_id", id)
      .order("occurred_at", { ascending: true });

    // 前日（直前）の退勤
    let prevClockOut: string | null = null;
    if (shift.clock_in_at) {
      const { data: prev } = await supabase
        .from("shifts")
        .select("clock_out_at")
        .eq("driver_id", shift.driver_id)
        .not("clock_out_at", "is", null)
        .lt("clock_out_at", shift.clock_in_at)
        .order("clock_out_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      prevClockOut = prev?.clock_out_at ?? null;
    }

    return ok({
      shift: { clockIn: shift.clock_in_at, clockOut: shift.clock_out_at, workDate: shift.work_date },
      prevClockOut,
      events: events ?? [],
    });
  });
}

/**
 * POST /api/admin/shifts/:id  勤怠修正（修正入力 / 仕様書 F-19, 8.1）
 *   出退勤の修正値(HH:MM)＋翌日補正(日数)＋休憩(分)＋理由を登録し、確定出退勤を再構成して
 *   拘束/労働/深夜/休息を再計算・違反再判定。週起算は日曜（現行運用準拠）。
 */
const schema = z.object({
  edited_in: z.string().regex(/^\d{1,2}:\d{2}/).nullable().optional(),
  edited_out: z.string().regex(/^\d{1,2}:\d{2}/).nullable().optional(),
  edited_in_adj_days: z.number().int().min(0).max(3).optional(),
  edited_out_adj_days: z.number().int().min(0).max(3).optional(),
  rest_min: z.number().int().min(0).max(1440).optional(),
  revision_reason: z.string().max(500).nullable().optional(),
  // 改善基準告示の特例（該当勤務のみ・要社労士確認）
  crew_type: z.enum(["single", "double"]).optional(),
  ferry_min: z.number().int().min(0).max(1440).optional(),
  split_rest: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const result = await applyShiftEdit(supabase, id, {
      editedIn: body.edited_in,
      editedOut: body.edited_out,
      inAdjDays: body.edited_in_adj_days,
      outAdjDays: body.edited_out_adj_days,
      restMin: body.rest_min,
      reason: body.revision_reason,
      crewType: body.crew_type,
      ferryMin: body.ferry_min,
      splitRest: body.split_rest,
    });

    return ok({ id, metrics: result?.metrics ?? null, judgement: result?.judgement ?? null });
  });
}
