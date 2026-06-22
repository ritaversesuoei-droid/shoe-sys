import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { toWorkDate } from "@/lib/datekey";

/**
 * GET /api/dispatch-plans/today  当日予定（仕様書 F-09, 8.1）
 * 自身の当日の配車予定を返す。積込フォームのカンタン転記に利用。
 */
export async function GET() {
  return handle(async () => {
    const ctx = await requireDriver();
    const supabase = await createClient();
    const today = toWorkDate(new Date());

    const { data, error } = await supabase
      .from("dispatch_plans")
      .select("*")
      .eq("driver_id", ctx.driverId)
      .eq("plan_date", today)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return ok({ plans: data ?? [] });
  });
}
