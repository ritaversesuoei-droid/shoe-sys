import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { monthlySummarySchema } from "@/lib/validation";
import { getMonthlySummary } from "@/lib/operations/monthly-summary";

/**
 * POST /api/admin/monthly-summary  月次集計（仕様書 F-14, 8.1）
 *   ドライバー別に 出勤日数・拘束・労働・残業・休日労働・深夜・違反件数を集計、日別詳細を展開。
 *   休日労働=休日(土日・祝日・手修正)の労働。祝日は src/lib/holidays.ts で算出、手修正は
 *   app_settings('holiday_overrides')（PATCH /api/admin/holidays）。所定は app_settings('payroll')。
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
