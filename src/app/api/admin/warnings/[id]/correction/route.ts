import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api/response";
import { correctionSchema } from "@/lib/validation";

/**
 * POST /api/admin/warnings/:id/correction  是正理由登録（仕様書 F-13, 8.1 / 状態遷移5.3）
 * 是正理由・指導内容を記録し、解消(resolve)するとソフト解消（status=resolved）で監査証跡保持（13章D）。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ctx = await requireAdmin();
    const { id } = await params;
    const body = correctionSchema.parse(await request.json());

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("compliance_alerts")
      .update({
        correction_reason: body.correction_reason,
        correction_note: body.correction_note ?? null,
        status: body.resolve ? "resolved" : "open",
        corrected_by: ctx.userId,
        corrected_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("対象の警告が見つかりません", 404);

    return ok({ id: data.id, status: data.status });
  });
}
