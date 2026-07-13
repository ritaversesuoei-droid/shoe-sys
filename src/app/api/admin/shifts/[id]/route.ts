import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, handle } from "@/lib/api/response";
import { z } from "zod";
import { applyShiftEdit } from "@/lib/operations/shift";

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
