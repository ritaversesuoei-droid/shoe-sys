import { createClient } from "@/lib/supabase/server";
import { requireDriver } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { toWorkDate } from "@/lib/datekey";

/**
 * GET /api/events/today  当日履歴（仕様書 F-08, 8.1）
 * 自身の当日打刻を新しい順に返す。出発打刻に到達した時点までを1日分とみなす。
 */
export async function GET() {
  return handle(async () => {
    const ctx = await requireDriver();
    const supabase = await createClient();
    const today = toWorkDate(new Date());

    const { data, error } = await supabase
      .from("events")
      .select("*, event_items(*), event_photos(*)")
      .eq("driver_id", ctx.driverId)
      .gte("occurred_at", `${today}T00:00:00+09:00`)
      .lte("occurred_at", `${today}T23:59:59+09:00`)
      .order("occurred_at", { ascending: false });

    if (error) throw error;
    return ok({ events: data ?? [] });
  });
}
