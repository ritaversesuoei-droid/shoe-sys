import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, handle } from "@/lib/api/response";
import { z } from "zod";

/**
 * POST /api/admin/shifts/confirm  勤怠修正の「確認済み」一括切替（③(1)）。
 *   チェックした勤務をまとめて確認済み/未確認にする（確認済みフォルダへ移動）。
 */
const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  confirmed: z.boolean().default(true),
});

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const { ids, confirmed } = schema.parse(await request.json());
    const supabase = await createClient();
    const { error } = await supabase.from("shifts").update({ confirmed }).in("id", ids);
    if (error) throw error;
    return ok({ updated: ids.length, confirmed });
  });
}
