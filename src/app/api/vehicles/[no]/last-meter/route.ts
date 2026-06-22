import { createClient } from "@/lib/supabase/server";
import { getSessionContext, AuthError } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";

/**
 * GET /api/vehicles/:no/last-meter  前回メーター（仕様書 F-21, 8.1）
 * 当該車番の直近の終了メーターを返し、次回開始メーターの補完に使う（自身の当日行はスキップ）。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ no: string }> },
) {
  return handle(async () => {
    const ctx = await getSessionContext();
    if (!ctx) throw new AuthError("未認証です", 401);
    const { no } = await params;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_reports")
      .select("meter_end, return_at")
      .eq("vehicle_no", no)
      .not("meter_end", "is", null)
      .order("return_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return ok({ vehicle_no: no, last_meter: data?.meter_end ?? null });
  });
}
