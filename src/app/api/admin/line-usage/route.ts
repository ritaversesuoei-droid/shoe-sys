import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ok, handle } from "@/lib/api/response";
import { to_month_key } from "@/lib/datekey";

/**
 * GET /api/admin/line-usage  LINE通知残数（仕様書 F-20, 8.1 / 12.2-#6）
 * 月キー付きカウンタ（暦月またぎ事故を回避）。
 */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const supabase = await createClient();
    const monthKey = to_month_key(new Date());

    const { data, error } = await supabase
      .from("line_usage")
      .select("*")
      .eq("month_key", monthKey)
      .maybeSingle();
    if (error) throw error;

    const sent = data?.sent_count ?? 0;
    const limit = data?.limit_count ?? null;
    return ok({
      month_key: monthKey,
      sent_count: sent,
      limit_count: limit,
      remaining: limit != null ? Math.max(0, limit - sent) : null,
    });
  });
}
