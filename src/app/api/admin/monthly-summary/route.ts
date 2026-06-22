import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { monthlySummarySchema } from "@/lib/validation";
import { getMonthlySummary } from "@/lib/operations/monthly-summary";

/**
 * POST /api/admin/monthly-summary  月次集計（仕様書 F-14, 8.1）
 *   ドライバー別に 出勤日数・拘束・労働・残業・休日労働・深夜・違反件数を集計、日別詳細を展開。
 *   TODO: 祝日カレンダー連携 / 休日区分の手修正→再計算 / 拘束14h超「週2回まで」週次判定。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = monthlySummarySchema.parse(await request.json());
    const supabase = await createClient();
    const summary = await getMonthlySummary(supabase, body.month_key, body.driver_id);
    return ok({ month_key: body.month_key, summary });
  });
}
