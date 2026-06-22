import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { z } from "zod";
import { loadComplianceConfig, calcShiftMetrics, judgeShift } from "@/lib/compliance";

/**
 * POST /api/admin/shifts/:id  時刻修正（仕様書 F-19, 8.1）
 * 管理者が出退勤の修正値（edited_in/out, 日跨ぎ補正）を登録 → 指標再計算 → 違反再判定。
 * 監査要件(10. 監査): 修正は変更履歴を保持（誰が・いつ・何を） … 履歴テーブルは次フェーズ。
 */
const updateShiftSchema = z.object({
  edited_in: z.string().nullable().optional(),
  edited_out: z.string().nullable().optional(),
  edited_in_adj_days: z.number().int().optional(),
  edited_out_adj_days: z.number().int().optional(),
  rest_min: z.number().int().min(0).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = updateShiftSchema.parse(await request.json());

    const supabase = await createClient();
    const { data: shift, error: e0 } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (e0) throw e0;
    if (!shift) return fail("勤務が見つかりません", 404);

    // 修正値を反映
    const patch = {
      edited_in: body.edited_in ?? shift.edited_in,
      edited_out: body.edited_out ?? shift.edited_out,
      edited_in_adj_days: body.edited_in_adj_days ?? shift.edited_in_adj_days,
      edited_out_adj_days: body.edited_out_adj_days ?? shift.edited_out_adj_days,
      revision_status: "edited" as const,
    };

    // 指標再計算（確定時刻ベース。edited を反映した clock_in/out の組み立ては次フェーズで精緻化）
    const config = await loadComplianceConfig(supabase);
    const metrics = calcShiftMetrics(
      {
        clockInAt: shift.clock_in_at,
        clockOutAt: shift.clock_out_at,
        restMin: body.rest_min ?? 0,
      },
      config,
    );
    const judgement = judgeShift(metrics, config);

    const { error: e1 } = await supabase
      .from("shifts")
      .update({
        ...patch,
        restraint_min: metrics.restraintMin,
        labor_min: metrics.laborMin,
        night_min: metrics.nightMin,
        rest_period_min: metrics.restPeriodMin,
      })
      .eq("id", id);
    if (e1) throw e1;

    return ok({ id, metrics, judgement });
  });
}
