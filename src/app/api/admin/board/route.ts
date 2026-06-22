import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { toWorkDate } from "@/lib/datekey";

/**
 * GET /api/admin/board?date=yyyy-MM-dd  運行盤面（仕様書 F-15, 8.1）
 * 指定日の全ドライバーの打刻を返す。フロントでタイムライン表示・状態色分け。
 * リアルタイム反映は別途 Supabase Realtime（クライアント購読）で行う。
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? toWorkDate(new Date());

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select("id, driver_id, event_type, occurred_at, vehicle_no, address, lat, lng, drivers(code, name)")
      .gte("occurred_at", `${date}T00:00:00+09:00`)
      .lte("occurred_at", `${date}T23:59:59+09:00`)
      .order("occurred_at", { ascending: true });
    if (error) throw error;

    return ok({ date, events: data ?? [] });
  });
}
